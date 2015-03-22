define(function () {
	return function MessageHelper(controllerContext) {
		var keyStore = controllerContext.keyStore,
			documentStore = controllerContext.documentStore,
			cryptHelper = controllerContext.cryptHelper,
			string = controllerContext.string,
			ecc = controllerContext.ecc,
			JSON = controllerContext.JSON,
			sjcl = ecc.sjcl;


		this.new = function (to, subject, sections) {
			var fromKey = null,
				user = null,
				messageKey = null;

			user = controllerContext.user;	
			fromKey = keyStore.find(user._id);
			
			messageKey = string.fromBits(sjcl, sjcl.random.randomWords(16)); 

			message = {
				to : to._id,
				from : user._id,
				sections : sections,
				type : "Message",
				publicKey : to.publicKey,
				signatureFields : cryptHelper.signatureFields['Message'],
				timestamp : Date.now(),
				status : "New"
			};

			message._id = "Message-" + message.to + "-" + message.from + "-" + message.timestamp;

			message.messageKey = ecc.encrypt(to.publicKey, messageKey);
			message.messageKeyFrom = ecc.encrypt(user.publicKey, messageKey);
			message.subject = sjcl.encrypt(messageKey, subject);
			message.sections = sjcl.encrypt(messageKey, JSON.stringify(sections));
			message = cryptHelper.author(message);

			return message;
		}

		this.verifyNew = function(acceptFn, fromVerify) {
			var user = controllerContext.user,
				userKey = keyStore.find(user._id);

			async.waterfall([
				documentStore.indexKey.bind(
					documentStore,
					"message-user-status", 
					[user._id, "New"]
				),
				function (messages, wfNext) {
					var froms = null;

					froms = messages.reduce(function (fromIds, message) {
						if (fromIds[message.from]) {
							return fromIds;
						}

						fromIds[message.from] = documentStore.get.bind(
							documentStore,
							message.from
						);

						return fromIds;

					}, {});

					async.parallel(
						froms,
						function (err, results) {
							if (err) {
								return wfNext(err);
							}

							return wfNext(null, results, messages);
						}
					);
				},
				function (froms, messages, wfNext) {
					async.mapSeries(
						messages,
						function (message, fromMap) {
							var author = froms[message.from],
								messageKey = null,
								sections = [];

							try {
								if (!cryptHelper.verifyAuthor(author, message)) {
									message.status = "Rejected";

									return fromMap(null, message);
								}

							} catch (e) {
								return fromMap(e);
							}
							
							try {
								messageKey = ecc.decrypt(userKey.private, message.messageKey);
							} catch (e) {
								console.log(e);
							}
							
							try {
								sections = JSON.parse(sjcl.decrypt(messageKey, message.sections));
							} catch (e) {
								messageKey = false;
							}

							if (!messageKey) {
								message.status = "Rejected";
								return fromMap(null, message);
							}

							message.status = "Verified";

							return acceptFn(message, sections, fromMap);
						},
						wfNext
					);
				},
				function (messages, wfNext) {
					async.map(
						messages,
						function (message, fromMap) {
							
							message = cryptHelper.sign(message, userKey);

							documentStore.put(message._id, message, fromMap);
						},
						wfNext
					);
				}],
				fromVerify
			);
		}

		this.list = function (message, userField) {
			var messageKey = null,
				user = controllerContext.user,
				key = keyStore.find(user._id),
				ts = new Date(message.timestamp),
				msgEl = { _id : message._id, status : message.status, timestamp : ts.toISOString() };

			msgEl.user = message[userField];

			try {
				messageKey = ecc.decrypt(key.private, userField == "from" ? message.messageKey :  message.messageKeyFrom);
			} catch (e) {
				msgEl.keyFail = true;
				return msgEl;
			}

			try {
				msgEl.subject = sjcl.decrypt(messageKey, message.subject);
				return msgEl;
			} catch (e) {
				msgEl.keyFail = true;
				return msgEl;
			}
		}
	}
});
