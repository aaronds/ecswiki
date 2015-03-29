define([], function () {

	return function (controllerContext, app) {
		var makeRender = controllerContext.makeRender,
			documentStore = controllerContext.documentStore,
			messageHelper = controllerContext.messageHelper,
			cryptHelper = controllerContext.cryptHelper,
			processError = controllerContext.processError,
			keyStore = controllerContext.keyStore,
			string = controllerContext.string,
			ecc = controllerContext.ecc,
			sjcl = controllerContext.sjcl,
			JSON = controllerContext.JSON;

		app.get("#/User/login", function (context) {
			var render = makeRender(context);

			return render(
				"User/login",
				{ 
					email : controllerContext.forceUser,
					redirectAfter : context.params.redirectAfter,
					forceUser : controllerContext.forceUser ? true : false
				}
			);
		});

		app.post("#/User/login", function (context) {
			var render = makeRender(context),
				email = null;

			if (!context.params.email || !context.params.password) {
				return render("User/login", { error : "Please enter a email address and password." });
			}

			email = context.params.email;
			email = email.trim().toLowerCase();

			async.waterfall([
				documentStore.get.bind(
					documentStore,
					email
				),
				function (doc, wfNext) {
					try {
						privateKeys = JSON.parse(sjcl.decrypt(doc.salt + context.params.password, doc.privateKeys));
					} catch (e) {
						return wfNext("Incorrect password.");
					}

					if (!privateKeys[context.params.email]) {
						return wfNext("Incorrect password.");
					}

					personalKey = privateKeys[context.params.email].slice().pop();
					if (personalKey.password !== context.params.password) {
						return wfNext("Incorrect passwod.");
					}

					controllerContext.user = {
						_id : doc._id,
						name : doc.name,
						publicKey : doc.publicKey,
						privateKeys : privateKeys,
						personalKey : personalKey
					};

					if (context.params.saveSession && controllerContext.sessionStorage) {
						sessionStorage.setItem("user", JSON.stringify(controllerContext.user));
					}

					messageHelper.verifyNew(
						cryptHelper.acceptKeys.bind(cryptHelper, doc),
						function (err, messages) {
							if (err) {
								return wfNext(err);
							}

							return wfNext(null, doc);
						}
					);
				}],
				function (err, doc) {
					var privateKeys = null,
						personalKey = null;

					if (err) {
						return render(
							"User/login",
							{
								email : email || controllerContext.forceUser,
								redirectAfter : context.params.redirectAfter,
								forceUser : controllerContext.forceUser,
								error : processError(err)
							}
						);
					}


					if (context.params.redirectAfter) {
						return context.redirect("#" + context.params.redirectAfter); 
					}

					return context.redirect("#Home");
				}
			);
		});

		app.get("#/User/new", function (context) {
			var render = makeRender(context);

			return render(
				"User/new",
				{ 
					email : controllerContext.forceUser,
					name : (controllerContext.user || {}).name,
					forceUser : controllerContext.forceUser ? true : false
				}
			);
		});

		app.post("#/User/new", function (context) {
			var render = makeRender(context),
				publicPrivateKey = null,
				userDoc = null,
				email = null,
				privateKeys = {},
				personalKey = {},
				password = null,
				salt = null;
				

			if (context.params.password != context.params.passwordTwo) {
				return render("User/new", { error : "Passwords do not match."});
			}

			email = context.params.email.trim();
			email = email.toLowerCase();

			if (!email || !context.params.password) {
				return render("User/new", { error : "Please enter a username or password." });
			}

			publicPrivateKey = ecc.generate(ecc.ENC_DEC);
			password = context.params.password;
			personalKey.password = password; 
			personalKey.private = publicPrivateKey.dec;
			personalKey.public = publicPrivateKey.enc;
			personalKey.version = 1;
			personalKey.name = email;
			
			privateKeys[email] = [ personalKey ];

			userDoc = {
				_id : email,
				name : context.params.name, 
				privateKeys : privateKeys,
				type : "User",
				groups : {}
			};

			userDoc = cryptHelper.encrypt(userDoc, personalKey); 

			documentStore.put(
				email,
				userDoc,
				function (err, result) {
					if (err) {
						return render("User/new", { error : typeof err == "object" ? JSON.stringify(err) : err });
					}
					
					return context.redirect("#/User/login");	
				}
			);
		});
		
		app.get("#/User/changePassword", function (context) {
			var render = makeRender(context);
			
			return render(
				"User/changePassword",
				{
					user : controllerContext.user
				}
			);
		});

		app.post("#/User/changePassword", function (context) {
			var render = makeRender(context),
				contextUser = controllerContext.user,
				body = context.params;

			async.waterfall([
				documentStore.get.bind(documentStore, contextUser._id),
				function (user, wfNext) {
					var personalKey = null,
						keys = null,
						publicPrivate = null,
						currentKey = {};

					user = cryptHelper.decrypt(user);
					
					keys = user.privateKeys[user._id]
					currentKey = keys[keys.length - 1];
					
					if (body.currentPassword != currentKey.password) {
						return wfNext("Password incorrect");
					}

					if (body.newPassword != body.repeatPassword) {
						return wfNext("Passwords do not match");
					}

					personalKey = {
						name : user._id,
						password : body.newPassword,
						version : currentKey.version + 1
					};

					if (body.regeneratePublic) {
						publicPrivate = ecc.generate(ecc.ENC_DEC);
						personalKey.private = publicPrivate.dec;
						personalKey.public = publicPrivate.enc;
					} else {
						personalKey.private = currentKey.private;
						personalKey.public = currentKey.public;
					}

					controllerContext.user.privateKeys[user._id].push(personalKey);
					controllerContext.user.personalKey = personalKey;

					user.privateKeys[user._id].push(personalKey);

					user = cryptHelper.encrypt(user, user._id);

					documentStore.put(user._id, user, function (err, user) {
						return wfNext(err, user, currentKey, personalKey);
					});
				},
				function (user, fromKey, toKey, wfNext) {
					cryptHelper.changeKey(
						"Page",
						fromKey,
						toKey,
						function () {},
						wfNext
					); 
				}],
				function (err, result) {
					if (err) {
						return render(
							"User/changePassword",
							{
								error : processError(err)
							}
						);
					}

					return render(
						"User/changePasswordDone",
						{
							result : result
						}
					);
				}
			);
		});

		app.get("#/User/logout", function (context) {
			delete controllerContext.user;
			sessionStorage.removeItem("user");

			return context.redirect("#/User/login");
		});
	}
});
