define([], function () {

	return function (controllerContext, app) {
		var makeRender = controllerContext.makeRender,
			documentStore = controllerContext.documentStore,
			keyStore = controllerContext.keyStore,
			ecc = controllerContext.ecc,
			sjcl = controllerContext.sjcl,
			JSON = controllerContext.JSON,
			marked = controllerContext.marked,
			string = controllerContext.string,
			search = controllerContext.search,
			cryptHelper = controllerContext.cryptHelper;
	
		app.get(/#[^\/].*/, function (context) { /* Render a wiki page */
			var path = window.location.hash.slice(1),
				render = makeRender(context);
			
			if (!controllerContext.user) {
				return context.redirect("#/User/login");
			}

			async.waterfall([
				documentStore.get.bind(
					documentStore,
					path 
				),
				function (doc, wfNext) {
					if (!doc.type || doc.type != "Page") {
						return wfNext("Document not a wiki page");
					}

					try {
						doc = cryptHelper.decrypt(doc);
					} catch (e) {
						return wfNext(e);
					}

					return wfNext(null, doc);
				}],
				function (err, doc) {
					if (err) {
						if (err.error && err.error == "not_found") {
							return context.redirect("#/Wiki/create/" + path);
						}

						return render(
							"Wiki/content",
							{ 
								error : typeof err == "object" ? JSON.stringify(err) : err
							}
						);
					}

					render(
						"Wiki/content",
						{
							path : path,
							content : marked(doc.content)
						}
					);
				}
			);
		});
		
		app.get(/#\/Wiki\/edit\/.*/, function (context) {
			var path = window.location.hash.slice(1),
				render = makeRender(context);

			path = path.replace(/\/Wiki\/edit\//,"");

			async.waterfall([
				documentStore.get.bind(
					documentStore,
					path
				),
				function (doc, wfNext) {
					var keyName = null,
						key = null,
						keys = null,
						version = null;

					if (!doc.type || doc.type != "Page") {
						return wfNext("Document not a wiki page");
					}

					try {
						doc = cryptHelper.decrypt(doc);
					} catch (e) {
						return wfNext(e);
					}

					return wfNext(null, doc);
				}],
				function (err, doc) {
					var data = null,
						keyName = null;

					if (err) {	
						return render(
							"Wiki/content",
							{ 
								error : typeof err == "object" ? JSON.stringify(err) : err
							}
						);
					}

					data = {
						_id : doc._id,
						_rev : doc._rev,
						path : path,
						title : doc._id.split(/[_\-\/]+/g).join(" "),
						markdown : doc.content,		
					};

					if (controllerContext.user.privateKeys) {
						keyName = (doc.encryption || {}).key;

						data.encryptionOptions = getEncryptionOptions(keyName);	
						data.canEncrypt = true;
					}

					render(
						"Wiki/edit",
						data
					);
				}
			);
		});
		
		app.post(/^#\/Wiki\/edit\//, function (context) { /* Edit a wiki page */
			var path = window.location.hash.slice(1),
				render = makeRender(context),
				body = context.params;

			path = path.replace(/\/Wiki\/edit\//,""),

			async.waterfall([
				documentStore.get.bind(
					documentStore,
					path
				),
				function (doc, wfNext) {
					var html = null;

					if (!doc.type || doc.type != "Page") {
						return wfNext("Document not a wiki page");
					}
					
					if (!body.ignoreRev && doc._rev != body._rev) {
						return wfNext({revision : true});
					}

					try {
						html = marked(body.content);
					} catch (e) {
						return wfNext(e);
					}

					doc.content = body.content;

					doc = cryptHelper.encrypt(doc, body.encrypt);

					if (!body.encrypt) {
						delete doc['encryption'];
					}

					documentStore.put(path, doc, wfNext);
				}],
				function (err, doc) {
					var data = null,
						encryptionOptions = null,
						keyName = null;

					encryptionOptions = getEncryptionOptions(body.encrypt);
					
					if (err) {
						console.warn(err);
						return render(
							"Wiki/content",
							{ 
								error : typeof err == "object" ? JSON.stringify(err) : err,
								_id : path || "index",
								_rev : body._rev,
								path : path,
								markdown : body.content,
								encryptionOptions : encryptionOptions,
								canEncrypt : encryptionOptions && encryptionOptions.length ? true : false
							}
						);
					}

					context.redirect("#" + path);
				}
			);
		});
		
		app.get(/#\/Wiki\/create\/.*/, function (context) {
			var path = window.location.hash.slice(1),
				render = makeRender(context),
				encryptionOptions = getEncryptionOptions(),
				body = context.params;

			path = path.replace(/\/Wiki\/create\//,"");

			render(
				"Wiki/create",
				{
					path : path,
					title : path.split(/[_\-\/]+/g).join(" "),
					encryptionOptions : encryptionOptions,
					canEncrypt : encryptionOptions ? true : false
				}
			);
		});
		
		app.post(/#\/Wiki\/create\/.*/, function (context) {
			var path = window.location.hash.slice(1),
				render = makeRender(context),
				body = context.params,
				key = null,
				error = null,
				page = null;
			
			path = path.replace(/\/Wiki\/create\//,"");

			page = {
				_id : path,
				type : "Page",
				content : "#" + path.split(/[_\-\/]+/g).join(" ") + "#"
			};

			async.waterfall([
				function (wfNext) {
					page = cryptHelper.encrypt(page, body.encrypt);

					documentStore.put(
						path,
						page,
						wfNext
					);
				}],
				function (err, res) {
					var encryptionOptions = getEncryptionOptions(body.encrypt);

					if (err) {
						render(
							"Wiki/create",
							{
								error : typeof err == "object" ? JSON.stringify(err) : err,
								path : path,
								title : page.title,
								encryptionOptions : encryptionOptions,
								canEncrypt : encryptionOptions ? true : false
							}
						);
					}

					return context.redirect("#" + path);
				}
			);
		});

		app.get("#/Wiki/search", function (context) {
			var	render = makeRender(context),
				query = context.params.query;

			search.query(
				query,
				function (err, docs) {
					if (err) {
						return render(
							"Wiki/search",
							{
								query : query,
								error : processError(err)
							}
						);
					}

					return render(
						"Wiki/search",
						{
							query : query,
							docs : docs.map(function (doc) {
								doc.title = doc._id.split(/[_\-\/]+/g).join(" ");				
								return doc;
							})
						}
					);
				}
			);
		});

		function getEncryptionOptions(selected) {

			return Object.keys(controllerContext.user.privateKeys).map(function (keyId) {
				key = controllerContext.user.privateKeys[keyId];
				return {
					name : keyId,
					value : keyId,
					selected : keyId == selected
				};
			});
		}
	}
});
