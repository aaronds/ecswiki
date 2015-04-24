define(function () {

	return function CryptHelper(controllerContext, options) {
		var keyStore = controllerContext.keyStore,
			string = controllerContext.string,
			ecc = controllerContext.ecc,
			JSON = controllerContext.JSON,
			documentStore = controllerContext.documentStore,
			async = controllerContext.async,
			sjcl = ecc.sjcl,
			cryptHelper = this,
			getId = controllerContext.getId;

		this.signatureFields = {
			"User" : ["_deleted", "privateKeys", "publicKey", "salt", "type"],
			"Group" : ["_deleted", "privateKeys", "publicKey", "salt", "type"],
			"Page" : ["_deleted", "content", "publicKey", "salt", "type"],
			"Message" : ["_deleted", "publicKey", "messageKey", "sections", "status", "to", "from", "subject", "timestamp", "type"]
		};

		this.encryptFields = {
			"User" : ["privateKeys"],
			"Group" : ["privateKeys"],
			"Page" : ["content"]
		};

		this.sign = function (doc, key, previousKey, version) {
			var type = doc.type,
				signFields = this.signatureFields[type];

			if (!signFields) {
				throw new Error("I don't know how to sign a '" + type + "'");
			}

			if (key && typeof key == "string") {
				key = keyStore.find(key, version);
			}

			if (key) {
				doc.publicKey = key.public;
			}

			if (previousKey) {
				doc.signature = ecc.sign(
					previousKey.private,
					signFields.reduce(string.concatFrom(doc), getId(doc._id))
				);
			} else if (key) {
				doc.signature = ecc.sign(
					key.private,
					signFields.reduce(string.concatFrom(doc), getId(doc._id))
				);
			}
			
			doc.signatureFields = signFields;

			return doc;
		}

		this.author = function (doc) {
			var key = null,
				signFields = this.signatureFields[doc.type];

			doc.author = controllerContext.user._id;

			key = keyStore.find(doc.author);

			doc.authorSignature = ecc.sign(
				key.private,
				signFields.reduce(string.concatFrom(doc), getId(doc._id))
			);

			return doc;
		}

		this.verifyAuthor = function (author, doc) {
			var signFields = this.signatureFields[doc.type];

			return ecc.verify(
				author.publicKey,
				doc.authorSignature,
				signFields.reduce(string.concatFrom(doc), getId(doc._id))
			);
		}

		this.encrypt = function (doc, key, fields) {
			var previousKey = null;

			if (doc.encryption) {
				previousKey = keyStore.find(doc.encryption.key, doc.encryption.version);
			}

			if (key && typeof key == "string") {
				key = keyStore.find(key);
			}

			if (!fields) {
				fields = this.encryptFields[doc.type];
			}

			if (key) {

				if (!fields) {
					throw new Error("No fields to encrypt for '" + doc.type + "'");
				}
				
				doc.encryption = {
					key : key.name,
					version : key.version
				};
				
				doc.salt = string.fromBits(sjcl, sjcl.random.randomWords(2));

				fields.forEach(function (field) {
					doc[field] = sjcl.encrypt(
						(doc.salt || "") + key.password,
						typeof doc[field] == "object" ? JSON.stringify(doc[field]) : doc[field]
					);
				});
			} else {
				delete doc['encryption'];
				delete doc['publicKey'];
				delete doc['salt'];
			}

			if (previousKey || key) {
				doc = this.sign(doc, key, previousKey);
			}

			return doc;
		}

		this.decrypt = function (doc) {
			var key = null,
				fields = null;

			if (!doc.encryption) {
				return doc;
			}

			key = keyStore.find(doc.encryption.key, doc.encryption.version);

			fields = this.encryptFields[doc.type];

			if (!fields) {
				throw new Error("No encryption fields defined for '" + doc.type + "'");
			}

			fields.forEach(function (field) {
				doc[field] = sjcl.decrypt((doc.salt || "") + key.password, doc[field]);

				try {
					doc[field] = JSON.parse(doc[field]);
				} catch (e) {
				}
			});

			return doc;
		}

		this.acceptKeys = function (user, message, sections, fromAccept) {
			var groups = null,
				changedGroups = [];

			groups = sections.filter(function (section) {
				return section.type == "Group";
			});

			user = cryptHelper.decrypt(user);

			groups.forEach(function (group) {
				if (user.privateKeys[group._id]) {
					group.privateKeys[group._id].forEach(function (version) {
						var changed = false,
							keyVersion = null;


						try {
							keyVersion = keyStore.find(group._id, version.version);
						} catch (e) {
							keyVersion = null;
						}

						if (!keyVersion) {
							user.privateKeys[group._id].push(version);
							changed = true;
							changedGroups.push(group._id);
						}
					});
				} else {
					user.privateKeys[group._id] = group.privateKeys[group._id];
					changedGroups.push(group._id);
				}
			});

			if (changedGroups.length) {
				controllerContext.user.privateKeys = user.privateKeys;
				changedGroups.forEach(function (group) {
					var salt = string.fromBits(sjcl, sjcl.random.randomWords(4)),
						groupKey = null,
						groupKeys = null;

					groupKeys = controllerContext.user.privateKeys[group]
					groupKeys.sort(function (a, b) {
						return a.version - b.version;
					});

					groupKey = groupKeys[groupKeys.length - 1];

					user.groups[group] = {version : groupKey.version, salt : salt, signature : ecc.sign(groupKey.private, salt + user._id)};
				});
			}

			user = cryptHelper.encrypt(user, user._id);

			if (changedGroups.length) {
				return documentStore.put(
					user._id,
					user,
					function (err) {
						return fromAccept(err, message);
					}
				);
			} else {
				return fromAccept(null, message);
			}
		}

		this.changeKey = function (type, fromKey, toKey, statusFn, fromChange) {
			async.waterfall([
				documentStore.indexKey.bind(
					documentStore,
					type.toLowerCase() + "-encryption",
					[fromKey.name]
				),
				function (docs, wfNext) {
					async.reduce(
						docs,
						{ success : [], fail : [] },
						function (result, doc, next) {
							var error = null;
							try {
								doc = cryptHelper.decrypt(doc);
								doc = cryptHelper.encrypt(doc, toKey);
							} catch (e) {
								error = e;
							}

							if (error) {
								result.fail.push({ doc : doc, error : error });

								statusFn({success : result.success.length, fail : result.fail.length });

								return next(null, result);
							}

							documentStore.put(
								doc._id,
								doc,
								function (err, newDoc) {
									if (err) {
										result.fail.push({ doc : doc, error : err });
									} else {
										result.success.push(newDoc);
									}
									statusFn({success : result.success.length, fail : result.fail.length });

									return  next(null, result);
								}
							);
						},
						wfNext
					);
				}],
				fromChange
			);
		}
	}
});
