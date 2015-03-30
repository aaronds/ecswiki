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
			cryptHelper = controllerContext.cryptHelper,
			processError = controllerContext.processError,
			markedRenderer = null;

	
		app.get(/#[^\/].*/, function (context) {
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
					var makredRenderer = null;

					if (err) {
						if (err.error && err.error == "not_found") {
							if (path.match(/Wiki\/create/)) {
								throw new Exception("Redirect loop");
							}

							return context.redirect("#/Wiki/create/" + path);
						}

						return render(
							"Wiki/content",
							{ 
								error : processError(err)
							}
						).then(function () {
							var userId = (controllerContext.user || {})._id;

							if (!err.requiredKey) {
								return;
							}

							documentStore.get(
								userId,
								function (userErr, user) {
									if (userErr) {
										return;
									}

									if (user._id == err.requiredKey || ((user.groups || {})[err.requiredKey])) {
										return context.redirect("#/User/login?redirectAfter=" + path);
									}
								}
							);
						});
					}

					markedRenderer = buildRenderer(doc, path); 

					render(
						"Wiki/content",
						{
							path : path,
							content : marked(
								doc.content,
								{
									renderer : markedRenderer
								}
							)
						}
					).then(function () {
						jQuery(".heading-subsections a").click(function (e) {
							var toId = null;

							e.preventDefault();

							toId = jQuery(e.target).attr("data-toid");

							jQuery("#" + toId + " .heading-edit a").focus();
						});
					});
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
								error : processError(err)
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
					).then(function () {
						jQuery("#content").focus();
					});
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
		
		app.get(/#\/Wiki\/editSection\/[^\/]*\/.*/, function (context) {
			var body = context.params,
				path = window.location.hash.slice(1),
				pathParts = null,
				render = makeRender(context),
				section = null,
				markerMatch = null,
				marker = null;


			path = path.replace(/\/Wiki\/editSection\//,"");
			pathParts = path.split(/\//);
			section = decodeURIComponent(pathParts.shift()).trim();
			path = pathParts.join("/");
			
			async.waterfall([
				documentStore.get.bind(
					documentStore,
					path
				),
				function (doc, wfNext) {
					var	sectionText = null,
						sectionName = null,
						sectionLevel = getSectionLevel(section),
						lineSectionLevel = null,
						lines = [],
						start = 0,
						end = 0,
						textAfter = null;

					if (!doc.type || doc.type != "Page") {
						return wfNext("Document not a wiki page");
					}

					sectionName = section.substring(sectionLevel);

					try {
						doc = cryptHelper.decrypt(doc);
					} catch (e) {
						return wfNext(e);
					}

					lines = doc.content.split("\r\n");

					for (start = 0; start < lines.length; start++) {
						var lineSectionLevel = getSectionLevel(lines[start]);
						if (lineSectionLevel === sectionLevel && lines[start].substring(sectionLevel).trim() == sectionName) {
							break;
						}
					}

					for (end = start + 1; end < lines.length; end++) {
						lineSectionLevel = getSectionLevel(lines[end]);

						if (lineSectionLevel && lineSectionLevel <= sectionLevel) {
							break;
						}	
					}

					sectionText = lines.slice(start, end).join("\r\n");

					return wfNext(null, doc, sectionText);

				}],
				function (err, doc, sectionText) {
					var data = null,
						sectionHash = null;

					if (err) {
						return render(
							"Wiki/editSection",
							{
								path : path,
								title : path.split(/[_\-\/]+/g).join(" "),
								section : encodeURIComponent(section),
								error : processError(err)
							}
						);
					}

					sectionHash = sjcl.codec.hex.fromBits(sjcl.hash.sha256.hash(sectionText));

					return render(
						"Wiki/editSection",
						{
							_id : doc._id,
							_rev : doc._rev,

							path : path,
							title : doc._id.split(/[_\-\/]+/g).join(" "),
							sectionTitle : section.replace(/#+/g,"").split(/[_\-\/]+/g).join(" "), 
							sectionHash : sectionHash,
							markdown : sectionText
						}
					).then(function () {
						jQuery("#content").focus();
					});
				}
			);
		});
		
		app.post(/#\/Wiki\/editSection\/[^\/]*\/.*/, function (context) {
			var body = context.params,
				path = window.location.hash.slice(1),
				pathParts = null,
				render = makeRender(context),
				section = null,
				markerMatch = null,
				marker = null;


			path = path.replace(/\/Wiki\/editSection\//,"");
			pathParts = path.split(/\//);
			section = decodeURIComponent(pathParts.shift()).trim();
			path = pathParts.join("/");
			
			async.waterfall([
				documentStore.get.bind(
					documentStore,
					path
				),
				function (doc, wfNext) {
					var	sectionText = null,
						sectionName = null,
						sectionLevel = getSectionLevel(section),
						hash = null,
						lineSectionLevel = null,
						lines = [],
						start = 0,
						end = 0,
						textAfter = null;

					if (!doc.type || doc.type != "Page") {
						return wfNext("Document not a wiki page");
					}

					sectionName = section.substring(sectionLevel);

					try {
						doc = cryptHelper.decrypt(doc);
					} catch (e) {
						return wfNext(e);
					}

					lines = doc.content.split("\r\n");

					for (start = 0; start < lines.length; start++) {
						var lineSectionLevel = getSectionLevel(lines[start]);
						if (lineSectionLevel === sectionLevel && lines[start].substring(sectionLevel).trim() == sectionName) {
							break;
						}
					}

					for (end = start + 1; end < lines.length; end++) {
						lineSectionLevel = getSectionLevel(lines[end]);

						if (lineSectionLevel && lineSectionLevel <= sectionLevel) {
							break;
						}	
					}

					sectionText = lines.slice(start, end).join("\r\n");

					hash = sjcl.codec.hex.fromBits(sjcl.hash.sha256.hash(sectionText));

					if (!body.override && hash != body.sectionHash) {
						return wfNext("Section content has changed");
					}

					doc.content = lines.slice(0, start).concat(body.content.split("\r\n"), lines.slice(end)).join("\r\n");

					if (doc.encryption) {
						doc = cryptHelper.encrypt(doc, doc.encryption.key);
					}

					return documentStore.put(doc._id, doc, wfNext);
				}],
				function (err, doc) {
					var data = null,
						sectionHash = null;

					if (err) {
						return render(
							"Wiki/editSection",
							{
								path : path,
								title : path.split(/[_\-\/]+/g).join(" "),
								section : encodeURIComponent(section),
								error : processError(err)
							}
						);
					}

					return context.redirect("#" + path);
				}
			);
		})
		
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
				content : "#" + path.split(/[_\-\/]+/g).join(" ") + "\r\n"
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

		app.get("#/Wiki/import", function (context) {
			var	render = makeRender(context);

			return render("Wiki/import",{});
		});

		app.post("#/Wiki/import", function (context) {
			var	render = makeRender(context),
				body = context.params;

			async.waterfall([
				function (wfNext) {
					var pageData = null;

					try {
						pageData = JSON.parse(body.data);
					} catch (e) {
						return wfNext(e);
					}

					async.mapSeries(
						pageData.pages,
						function (page, fromMap) {
							if (page.encryption) {
								page = cryptHelper.encrypt(page, page.encryption.key);
							}

							documentStore.put(
								page._id,
								page,
								fromMap
							);
						},
						wfNext
					);
				}],
				function (err, result) {
					if (err) {
						return render(
							"Wiki/import",
							{
								error : processError(err)
							}
						);
					}
				}
			);
		});

		function getEncryptionOptions(selected) {

			return Object.keys(controllerContext.user.privateKeys || {}).map(function (keyId) {
				key = controllerContext.user.privateKeys[keyId];
				return {
					name : keyId,
					value : keyId,
					selected : keyId == selected
				};
			});
		}

		function buildRenderer(doc, path) {
			var lines = doc.content.split("\r\n");

			markedRenderer = new (marked.Renderer)();
			markedRenderer.heading = function (text, level) {
				var subSections = [];

				if (level == 1) {
					subSections = lines.filter(function (line) {
						return getSectionLevel(line) == 2;
					});

					subSections = subSections.map(function (section) {
						var sectionName = section.replace(/\#/g,"").trim();
						return {
							name : sectionName,
							id : sectionName.toLowerCase().replace(/[^\w]+/g, '-')
						};
					});
				}


				return Mustache.to_html(
					controllerContext.views["Markdown/heading"],
					{
						id : escapedText = text.toLowerCase().replace(/[^\w]+/g, '-'),
						level : level,
						text : text,
						showEdit : level <= 3,
						subSections : subSections,
						showSubSections : subSections.length > 2,
						path : path,
						section : encodeURIComponent(markedSection(text, level))
					},
					controllerContext.views
				);
			}

			return markedRenderer;

			function markedSection(text, level) {
				var sectionMarker = "",
					i = 0;

				for (i = 0; i < level; i++) {
					sectionMarker = sectionMarker + "#";
				}

				return sectionMarker + text;
			}
		}
					
		function getSectionLevel(line) {
			var res = line.match(/^(#+)/);

			if (!res) {
				return false;
			}

			return res[1].length;
		}
	}
});
