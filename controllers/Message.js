define([], function () {

	return function (controllerContext, app) {
		var makeRender = controllerContext.makeRender,
			documentStore = controllerContext.documentStore,
			keyStore = controllerContext.keyStore,
			messageHelper = controllerContext.messageHelper,
			cryptHelper = controllerContext.cryptHelper,
			auth = controllerContext.auth,
			string = controllerContext.string,
			processError = controllerContext.processError,
			ecc = controllerContext.ecc,
			sjcl = controllerContext.sjcl,
			JSON = controllerContext.JSON;

		app.get("#/Message/inbox", function (context) {
			var render = makeRender(context),
				user = null;

			if (!auth.isUser()) {
				return context.redirect("#/User/login");
			}

			user = controllerContext.user;

			async.waterfall([
				async.parallel.bind(
					async,
					{
						count : documentStore.countRange.bind(
							documentStore,
							"message-to-timestamp",
							[user._id, 0],
							[user._id, Date.now() + 99999]
						),
						messages : documentStore.indexRange.bind(
							documentStore,
							"message-to-timestamp",
							[user._id, 0],
							[user._id, Date.now() + 99999],
							0,
							100
						)
					}
				),
				function (results, wfNext) {
					var count = results.count,
						messages = results.messages,
						froms = {};

					froms = messages.reduce(function (froms, message) {
						if (!froms[message.from]) {
							froms[message.from] = documentStore.get.bind(documentStore, message.from);
						}

						return froms;
					}, {});

					async.parallel(
						froms,
						function (err, froms) {
							return wfNext(err, messages, froms, count);
						}
					);
				}],
				function (err, messages, froms, count) {
					var list = [];

					if (err) {
						return render(
							"Message/inbox",
							{
								error : processError(err)
							}
						);
					}

					list = messages.map(function (message) {
						var listEl = null;

						listEl = messageHelper.list(message, "from");

						listEl.userName = froms[message.from].name;

						return listEl;
					});

					return render(
						"Message/inbox",
						{
							list : list,
							count : count
						}
					);
				}
			);
		});
		
		app.get("#/Message/outbox", function (context) {
			var render = makeRender(context),
				user = null;

			if (!auth.isUser()) {
				return context.redirect("#/User/login");
			}

			user = controllerContext.user;

			async.waterfall([
				async.parallel.bind(
					async,
					{
						count : documentStore.countRange.bind(
							documentStore,
							"message-from-timestamp",
							[user._id, 0],
							[user._id, Date.now() + 99999]
						),
						messages : documentStore.indexRange.bind(
							documentStore,
							"message-from-timestamp",
							[user._id, 0],
							[user._id, Date.now() + 99999],
							0,
							100
						)
					}
				),
				function (results, wfNext) {
					var count = results.count,
						messages = results.messages,
						tos = {};

					tos = messages.reduce(function (tos, message) {
						if (!tos[message.to]) {
							tos[message.to] = documentStore.get.bind(documentStore, message.to);
						}

						return tos;
					}, {});

					async.parallel(
						tos,
						function (err, tos) {
							return wfNext(err, messages, tos, count);
						}
					);
				}],
				function (err, messages, tos, count) {
					var list = [];

					if (err) {
						return render(
							"Message/outbox",
							{
								error : processError(err)
							}
						);
					}

					list = messages.map(function (message) {
						var listEl = null;

						listEl = messageHelper.list(message, "to");

						listEl.userName = tos[message.to].name;

						return listEl;
					});

					return render(
						"Message/outbox",
						{
							list : list,
							count : count
						}
					);
				}
			);
		});
		
		app.get("#/Message/view/:user/:id", function (context) {
			var id = context.params.id,
				user = controllerContext.user,
				render = makeRender(context),
				key = keyStore.find(user._id);

			async.waterfall([
				async.parallel.bind(
					async,
					{
						message : documentStore.get.bind(documentStore, id),
						user : documentStore.get.bind(documentStore, user._id)
					}
				),
				function (results, wfNext) {
					var message = results.message,
						user = results.user,
						requests = {};

					if (message.to == user._id) {
						requests.to = function (toTo) {
							return toTo(null, user);
						}
					} else {
						requests.to = documentStore.get.bind(documentStore, message.to);
					}

					if (message.from == user._id) {
						requests.from = function (toFrom) {
							return toFrom(null, user);
						}
					} else {
						requests.from = documentStore.get.bind(documentStore, message.from);
					}

					if (message.status == "Verified") {
						requests.message = function (toMessage) {
							message.status = "Read";
							
							documentStore.put(
								message._id,
								message,
								toMessage
							);
						}
					} else {
						requests.message = function (toMessage) {
							return toMessage(message);
						}
					}

					async.parallel(
						requests,
						function (err, results) {
							return wfNext(err, (results || {}).message, (results || {}).to, (results || {}).from);
						}
					);
				},
				function (message, to, from, wfNext) {
					var messageKey = null;

					try {
						if (message.from == user._id) {
							messageKey = ecc.decrypt(key.private, message.messageKeyFrom);
						} else {
							messageKey = ecc.decrypt(key.private, message.messageKey);
						}

						message.subject = sjcl.decrypt(messageKey, message.subject);
						message.sections = JSON.parse(sjcl.decrypt(messageKey, message.sections));
					} catch (e) {
						return wfNext(e, message, to, from);
					}

					return wfNext(null, message, to, from);
				}],
				function (err, message, to, from) {
					var data = null;

					if (err) {
						return render(
							"Message/view",
							{
								error : processError(err)
							}
						);
					}

					data = {
						_id : message._id,
						to : message.to,
						toName : to.name,
						from : message.from,
						fromName : from.name,
						subject : message.subject,
						status : message.status
					};

					data.sections = message.sections.map(function (section) {
						section["type" + section.type] = true;

						if (section.type == "Markdown") {
							try {
								section.html = marked(section.content);
							} catch (e) {
							}
						}

						return section;
					});

					data.backTo = message.from == user._id ? "outbox" : "inbox";
					return render("Message/view", data);
				}
			);
		});

		app.get("#/Message/send", function (context) {
			var render = makeRender(context);

			return render("Message/send", {});
		});

		app.post("#/Message/send", function (context) {
			var render = makeRender(context),
				user = controllerContext.user,
				to = context.params.to,
				body = context.params;

			async.waterfall([
				async.parallel.bind(
					async,
					{
						to : documentStore.get.bind(documentStore, to),
						from : documentStore.get.bind(documentStore, user._id)
					}
				),
				function (result, wfNext) {
					var to = result.to,
						from = result.from,
						message = null;

					try {

						message = messageHelper.new(
							to,
							body.subject,
							[
								{
									content : body.message,
									type : "Markdown"
								}
							]
						);
					} catch (e) {
						return wfNext(e);
					}	

					if (body.inReplyTo) {
						message.inReplyTo = body.inReplyTo;
					}

					documentStore.put(
						message._id,
						message,
						wfNext
					);
				}],
				function (err, message) {
					if (err) {
						return render(
							"Message/send",
							{
								to : body.to, 
								message : body.message, 
								error : processError(err)
							}
						);
					}

					return render(
						"Message/sendComplete",
						{ _id : message._id }
					);
				}
			);
		});
	}
});
