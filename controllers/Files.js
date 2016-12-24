define([], function () {

	return function (controllerContext, app) {
		var makeRender = controllerContext.makeRender,
			documentStore = controllerContext.documentStore,
			processError = controllerContext.processError,
			commonMetaData = controllerContext.commonMetaData,
			async = controllerContext.async,
			config = controllerContext.config,
			string = controllerContext.string;

		app.get("#/Files/:page", function (ctx) {
			var render = makeRender(ctx),
				page = ctx.params.page;
			
			if (!config.files) {
				return;
			}

			documentStore.get(
				page,
				function (err, doc) {
					var data = {},
						attachments = [],
						files = {};

					if (err) {
						data.error = processError(err);
						return render('Files/index', data);
					}

					attachments = Object.keys(doc._attachments || {}).map(function (name) {
						var attc = doc._attachments[name];
						return {
							file : name,
							length : attc.length,
							contentType : attc.content_type,
							metaData : ((doc.files || {})[name] || {}).metaData
						};
					});

					attachments.sort(string.strcmp);
					data.title = string.titlize(doc._id);
					data.attachments = attachments;
					data.page = page;

					return render("Files/index", data);
				}
			);
		});

		app.get("#/Files/:page/:file", function (ctx) {
			var render = makeRender(ctx),
				page = ctx.params.page,
				file = ctx.params.file;
			
			if (!config.files) {
				return;
			}

			documentStore.get(
				page,
				function (err, doc) {
					var data = {},
						fileMetaConfig = null;

					if (err) {
						data.error = processError(err);
						return render("Files/file", data);
					}

					/*TODO: Merge*/
					fileMetaConfig = ((doc.config || {}).files || {}).metaData || config.files.metaData;
					data.metaData = commonMetaData.get((doc.files || {})[file] || {}, fileMetaConfig);
					data.hasMetaData = (data.metaData || []).length > 0;
					data.title = string.titlize(doc._id);
					data.file = doc._attachments[file]; 
					data.path = file;
					data.page = page;
					data.link = documentStore.attachmentUrl(doc, file);

					return render("Files/file", data);
				}
			);
		});

		app.post("#/Files/:page", function (ctx) {
			var page = ctx.params.page,
				body = ctx.params,
				render = makeRender(ctx),
				file = jQuery("#file").get(0).files[0],
				fileName = null;

			if (!config.files) {
				return;
			}
					
			fileName = body.fileName || file.name;

			if (config.files.normalizeNames) {
				fileName = fileName.replace(/\s+/g, config.files.normalizeNames);
			}

			async.waterfall([
				documentStore.get.bind(
					documentStore,
					page
				),
				function (doc, wfNext) {
					if (file) {
						return documentStore.putAttachment(doc, fileName, file, wfNext);
					} else {
						return wfNext(null, doc);
					}
				},
				function (doc, wfNext) {
					return documentStore.get(page, wfNext);
				},
				function (doc, wfNext) {
					var fileMetaData = null;

					if (!doc.files) {
						doc.files = {};
					}

					if (!doc.files[fileName]) {
						doc.files[fileName] = {
							created : Date.now(),
							createdBy : (controllerContext.user || {})._id,
							metaData : {}
						};
					}

					delete doc._attachements;

					doc.files[fileName].updated = Date.now();
					doc.files[fileName].updatedBy = (controllerContext.user || {})._id;

					fileMetaData = ((doc.config || {}).metaData) || config.files.metaData;

					if (fileMetaData) {

						doc.files[fileName] = commonMetaData.set(doc.files[fileName], body || {}, fileMetaData);
					}

					documentStore.put(doc._id, doc, wfNext);
				}],
				function (err, doc) {
					var data = {};

					if (err) {
						data.error = processError(err);
						return render("Files/file", data);
					}

					return ctx.redirect("#/Files/" + page + "/" + fileName);
				}
			);
		});
	}
});
