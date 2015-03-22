define(function () {
	return function Search(controllerContext) {
		var documentStore = controllerContext.documentStore,
			async = controllerContext.async,
			stemmer = controllerContext.stemmer,
			cryptHelper = controllerContext.cryptHelper,
			keyStore = controllerContext.keyStore,
			marked = controllerContext.marked;


		this.query = function (query, fromSearch) {
			var docCount = 1,
				offset = 0,
				documents = [],
				documentCount = {},
				tokens = null;
		
			tokens = query.toLowerCase()
				.replace(/[^\w]/g, ' ')
				.split(' ')
				.map(function (str) {
					return stemmer(str);
				})
				.reduce(function (tokens, stem) {
					if (tokens.indexOf(stem) < 0) {
						tokens.push(stem);
					}

					return tokens;
				}, []);

			async.whilst(
				function () {
					return docCount > 0;
				},
				function (loop) {
					documentStore.indexRange(
						"type",
						["Page"],
						["Page"],
						offset,
						100,
						function (err, docs) {
							if (err) {
								return loop(err);
							}

							docCount = docs.length;
							offset += docs.length;

							docs = docs
								.filter(withAccess)
								.map(function (doc) {
									try {
										return cryptHelper.decrypt(doc)
									} catch (e) {
										return false;
									}

									return doc;
								})
								.filter(Boolean)
								.map(function (doc) {
									var markdTokens = null,
										tokenCount = {},
										lexer = null,
										documentTokens = 0;
		
									lexer = new (marked.Lexer)();

									markdTokens = lexer.lex(doc.content)
										.filter(withText)
										.map(function (token) {
											var text = token.text.toLowerCase();
											text = text
												.replace(/[^\w]/g, ' ')
												.split(' ');

											return text;
										})

									markdTokens = Array.prototype.concat.apply([], markdTokens);

									markdTokens = markdTokens.map(stemmer);
									tokenCount = markdTokens.reduce(function (tokenCount, token) {
										if (tokens.indexOf(token) < 0) {
											return tokenCount;
										}

										if (!tokenCount[token]) {
											tokenCount[token] = 0;

											if (!documentCount[token]) {
												documentCount[token] = 0;
											}

											documentCount[token]++;
										}

										tokenCount[token]++;
										documentTokens++;

										return tokenCount;
									}, tokenCount);

									return {
										_id : doc._id,
										tokens : tokenCount,
										totalTokens : documentTokens
									};
								})
								.filter(function (doc) {
									return doc.totalTokens > 0;
								});

							documents = documents.concat(docs);

							return loop(null);

							function withAccess(doc) {
								if (doc.encryption) {
									try {
										keyStore.find(doc.encryption.key, doc.encryption.version);
									} catch (e) {
										return false;
									}
								}

								return true;
							}

							function withText(token) {
								return token.text;
							}
						}
					);
				},
				function (err) {
					var termWeights = {};

					if (err) {
						return fromSearch(err);
					}

					termWeights = tokens.reduce(function (termWeights, token) {
						termWeights[token] = Math.log(documents.length / (documentCount[token] || 0));
						return termWeights;
					}, {});

					documents = documents
						.map(function (doc) {
							doc.score = tokens.reduce(function (score, term) {
								return score + (termWeights[term] * (doc.tokens[term] || 0));
							}, 0);

							return doc;
						});

					documents.sort(function (a, b) {
						return a.score - b.score;
					});

					return fromSearch(null, documents); 
				}
			);
		}
	}
});
