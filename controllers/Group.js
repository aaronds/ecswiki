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

		app.get("#/Group/list", function (context) {
			var render = makeRender(context),
				myGroups = null;

			if (!auth.hasPrivateKeys()) {
				return context.redirect("#/User/login");
			}

			myGroups = Object.keys(controllerContext.user.privateKeys).filter(function (keyName) {
				return keyName != controllerContext.user._id;
			});

			async.waterfall([
				async.map.bind(
					async,
					myGroups,
					documentStore.get.bind(documentStore)
				)],
				function (err, groups) {
					var data = {};

					if (err) {
						data.error = processError(err);

						return render('Group/list', data);
					}

					data.groups = groups;

					return render('Group/list', data);
				}
			);
		});

		app.get("#/Group/view/:groupId", function (context) {
			var render = makeRender(context),
				groupId = context.params.groupId;
			
			if (!auth.hasPrivateKeys()) {
				return context.redirect("#/User/login");
			}

			async.waterfall([
				documentStore.get.bind(
					documentStore,
					groupId
				),
				function (group, wfNext) {
					try {
						group = cryptHelper.decrypt(group);
					} catch (e) {
						return wfNext(e);
					}

					return wfNext(null, group);
				}],
				function (err, group) {

					if (err) {
						return render(
							"Group/view",
							{
								_id : groupId,
								error : processError(err)
							}
						);
					}

					return render(
						"Group/view",
						{
							_id : group._id,
							name : group.name,
							keys : group.privateKeys[groupId].slice().pop()
						}
					);
				}
			);
		});

		app.get("#/Group/create", function (context) {
			var render = makeRender(context);

			if (!auth.hasPrivateKeys()) {
				return context.redirect("#/User/login");
			}

			return render(
				"Group/create",
				{
				}
			);
		});

		app.post("#/Group/create", function (context) {
			var render = makeRender(context),
				body = context.params,
				_id = body._id,
				name = body.name,
				password = body.password;

			if (!auth.hasPrivateKeys()) {
				return context.redirect("#/User/login");
			}

			if (!password) {	
				password = string.fromBits(sjcl, sjcl.random.randomWords(6));
			}

			async.waterfall([
				async.parallel.bind(
					async,
					{
						user : documentStore.get.bind(documentStore, controllerContext.user._id),
						group : function (toGroup) {
							documentStore.get(name, function (err, doc) {
								if (!err) {
									return toGroup("Group already exists");
								}

								if (err.error && err.error == "not_found") {
									return toGroup(null,true);
								} else {
									return toGroup(err);
								}
							});
						}
					}
				),
				function (results, wfNext) {
					var user = results.user,
						publicPrivateKey = null,
						privateKeys = {},
						groupKey = null,
						group = null,
						userKey = null,
						userPrivateKeys = null,
						salt = null;

					publicPrivateKey = ecc.generate(ecc.ENC_DEC);

					groupKey = {
						password : password,
						private : publicPrivateKey.dec,
						public : publicPrivateKey.enc,
						name : _id,
						version : 1
					};

					privateKeys[_id] = [groupKey];

					salt = string.fromBits(sjcl, sjcl.random.randomWords(4));

					group = {
						_id : _id,
						name : name,
						encryption : { key : _id, version : 1},
						publicKey : publicPrivateKey.enc,
						privateKeys : privateKeys,
						type : "Group"
					};

					try {
						user = cryptHelper.decrypt(user);
						user.privateKeys[_id] = [groupKey];
						controllerContext.user.privateKeys[_id] = [groupKey];
						user.groups[_id] = {version : 1, salt : salt, signature : ecc.sign(groupKey.private, salt + user._id)};
						user = cryptHelper.encrypt(user, user._id);
						group = cryptHelper.encrypt(group, groupKey);
					} catch (e) {
						return wfNext(e);
					}

					async.parallel(
						{
							group : documentStore.put.bind(
								documentStore,
								group._id,
								group
							),
							user : documentStore.put.bind(
								documentStore,
								user._id,
								user
							)
						},
						wfNext
					);
				}],
				function (err, results) {
					if (err) {
						console.warn(err);
						return render(
							"Group/create",
							{
								error : processError(err)
							}
						);
					}
					return context.redirect("#/Group/view/" + _id);
				}
			);
		});

		app.get("#/Group/invite/:id", function (context) {
			var render = makeRender(context),
				id = context.params.id;

			documentStore.get(
				id,
				function (err, group)	{
					if (err) {
						return renderError(err);
					}

					try {
						group = cryptHelper.decrypt(group);
					} catch (e) {
						return renderError(e);
					}

					return render(
						"Group/invite",
						{
							_id : group._id,
							group : group
						}
					);
					
					function renderError(err) {
						return render(
							"Group/invite",
							{
								error : processError(err)
							}
						);
					}
				}
			);
		});
		
		app.post("#/Group/invite/:id", function (context) {
			var render = makeRender(context),
				id = context.params.id,
				to = context.params.to;

			async.waterfall([
				async.parallel.bind(
					async,
					{
						group : documentStore.get.bind(
							documentStore,
							id
						),
						user : documentStore.get.bind(
							documentStore,
							to	
						)
					}
				),
				function (results, wfNext) {
					var user = results.user,
						group = results.group,
						messageSections = [],
						message = null;

					try {
						group = cryptHelper.decrypt(group);
						if (context.params.message) {
							messageSections.push({
								content : context.params.message,
								type : "Markdown"
							});
						}

						messageSections.push(group);

						message = messageHelper.new(user, context.params.subject, messageSections);	
					} catch (e) {
						return wfNext(e);
					}

					documentStore.put(
						message._id,
						message,
						wfNext
					);
				}],
				function (err, result) {
					if (err) {
						return render(
							"Group/invite",
							{
								error : processError(err),
								subject : context.params.subject,
								message : context.params.message
							}
						);
					}

					return render(
						"Group/inviteSent",
						{
							_id : id
						}
					);
				}
			);
		});

		app.get("#/Group/changePassword/:id", function (context) {
			var render = makeRender(context),
				id = context.params.id,
				currentUser = controllerContext.user;

			async.waterfall([
				async.parallel.bind(
					async,
					{
						group : documentStore.get.bind(documentStore, id),
						users : documentStore.indexKey.bind(
							documentStore,
							"user-group",
							[id]
						),
						pages : documentStore.countKey.bind(
							documentStore,
							"page-encryption",
							[id]
						),
					}
				),
				function (results, wfNext) {
					var group = results.group,
						users = results.users,
						pageCount = results.pageCount,
						activeKey = null,
						groupKeys = null;

					try {
						group = cryptHelper.decrypt(group);
					} catch (e) {
						return wfNext(e);
					}

					groupKeys = group.privateKeys[group._id];

					activeKey = groupKeys[groupKeys.length - 1];

					users = users.filter(function (user) {
						return currentUser._id != user._id;
					});

					users = users.map(function (user) {
						var userData = {_id : user._id, name : user.name},
							userSig = user.groups[group._id];

						try {

							if (userSig.version == activeKey.version) {
								userData.valid = ecc.verify(activeKey.public, userSig.signature, userSig.salt + user._id);
							}
						} catch (e) {
							return;
						}

						return userData;
					});

					return wfNext(null, group, users, pageCount);
				}],
				function (err, group, users, pageCount) {
					if (err) {
						return render(
							"Group/changePassword",
							{
								error : processError(err)
							}
						);
					}

					return render(
						"Group/changePassword",
						{
							_id : group._id,
							name : group.name,
							users : users,
							pageCount : pageCount
						}
					);
				}
			);
		});

		app.post("#/Group/changePassword/:id", function (context) {
			var render = makeRender(context),
				id = context.params.id,
				body = context.params;

			async.waterfall([
				async.parallel.bind(
					async,
					{
						user : documentStore.get.bind(documentStore, controllerContext.user._id),
						group : documentStore.get.bind(documentStore, id),
						users : async.map.bind(
							async,
							Object.keys(body.users),
							documentStore.get.bind(documentStore)
						)
					}
				),
				function (result, wfNext) {
					var user = result.user,
						group = result.group,
						users = result.users,
						groupKeys = null,
						activeKey = null,
						groupKey = null,
						publicPrivate = null,
						salt = null,
						userMessages = null,
						password = body.password;
			
					if (!password) {	
						password = string.fromBits(sjcl, sjcl.random.randomWords(6));
					}

					try {
						console.log("Decrypt User");
						user = cryptHelper.decrypt(user);
						console.log("Decrypt Group");
						group = cryptHelper.decrypt(group);

						groupKeys = group.privateKeys[group._id];
						activeKey = groupKeys[groupKeys.length - 1];

						groupKey = {
							password : password,
							name : group._id,
							version : activeKey.version + 1
						};

						if (body.generatePublic) {
							publicPrivate = ecc.generate(ecc.ENC_DEC);
							groupKey.private = publicPrivate.dec;
							groupKey.public = publicPrivate.enc;
						} else {
							groupKey.private = activeKey.private;
							groupKey.public = activeKey.public;
						}

						console.log("Generated new keys");

						group.privateKeys[group._id].push(groupKey);
						
						user.privateKeys[group._id].push(groupKey);
						salt = string.fromBits(sjcl, sjcl.random.randomWords(4));
						user.groups[group._id] = { version : groupKey.version, salt : salt, signature : ecc.sign(groupKey.private, salt + user._id) };

						userMessages = users.map(function (user) {
							return messageHelper.new(user, "Key : " + group._id, [ group ]);
						});

						console.log("Messages created");

						user = cryptHelper.encrypt(user, user._id);
						group = cryptHelper.encrypt(group, groupKey);
					} catch (e) {
						return wfNext(e);
					}

					async.mapSeries(
						[ user, group ].concat(userMessages),
						function (doc, fromMap) {
							return documentStore.put(doc._id, doc, fromMap);
						},
						function (err, results) {
							if (err) {
								return wfNext(err);
							}

							return wfNext(null, activeKey, groupKey);
						}
					);
				},
				function (fromKey, toKey, wfNext) {
					console.log("Changing keys");
					cryptHelper.changeKey(
						"Page",
						fromKey,
						toKey,
						function (result) {

						},
						wfNext
					);
				}],
				function (err, results) {
					if (err) {
						return render(
							"Group/changePassword",
							{
								error : processError(err)
							}
						);
					}

					return render(
						"Group/changePasswordDone",
						{
							_id : id
						}
					);
				}
			);
		});
	}
});
