define(function () {

	return function CommonMetaData(controllerContext) {
		var jQuery = controllerContext.jQuery,
			config = controllerContext.config,
			string = controllerContext.string;

		if (!controllerContext.metaDataTypes) {
			controllerContext.metaDataTypes = {};
		}

		this.get = function (doc) {
			var metaData = doc.metaData || {},
				metaDataTypes = controllerContext.metaDataTypes,
				metaFields = [];

			if (!config.metaData) {
				return [];
			}

			metaFields = Object.keys(config.metaData).map(function (name) {
				var metaConfig = config.metaData[name],
					metaValue = metaData[name],
					metaObject = null;

				metaObject = {
					name : name,
					type : metaConfig.type,
					title : metaConfig.title || string.upperCaseFirst(name),
					value : metaDataTypes[metaConfig.type].get(metaConfig, doc, name, metaValue)
				};

				metaObject["type" + string.upperCaseFirst(metaConfig.type)] = true;

				return metaObject;
			});

			return metaFields;
		}

		this.set = function (doc, body) {
			var metaDataBody = body.metaData || {},
				metaDataTypes = controllerContext.metaDataTypes,
				metaData = doc.metaData || {};

			if (!config.metaData) {
				return doc;
			}

			Object.keys(config.metaData).forEach(function (name) {
				var metaDataValue = metaData[name],
					metaConfig = config.metaData[name];

				metaData[name] = metaDataTypes[metaConfig.type].set(metaConfig, doc, name, metaDataValue, metaDataBody[name]);
			});

			doc.metaData = metaData;
			return doc;
		}

		controllerContext.metaDataTypes.text = {
			get : function (config, doc, name, value) {
				return value;
			},
			set : function (config, doc, name, value, body) {
				return body.value;
			},
			bind : function (config, metaEl, el, value) {
			}
		};

		controllerContext.metaDataTypes.createdTimestamp = {
			get : function (config, doc, name, value) {
				return value;
			},
			set : function (config, doc, name, value, body) {
				if (value) {
					return value;
				} else {
					return Date.now();
				}
			}
		}

		controllerContext.metaDataTypes.timestamp = {
			get : function (config, doc, name, value) {
				return value;
			},
			set : function (config, doc, name, value, body) {
				return Date.now();
			}
		};

		controllerContext.metaDataTypes.select = {
			get : function (config, doc, name, value) {
				var strValues = [];
				
				strValues = getStringValues(config, value);

				if (config.optionGroups) {
					return { 
						empty : config.empty,
						optionGroups : (config.optionGroups || []).map(function (optionGroup) {
							return {
								name : optionGroup.name,
								options : (optionGroup.options || []).map(selectOption)
							};
						})
					}
				} else {
					return { 
						empty : config.empty,
						options : (config.options || []).map(selectOption)
					};
				}

				function selectOption(option) {
					return {
						name : option.name,
						value : option.value,
						selected : strValues.indexOf(option.json ? JSON.stringify(option.json) : option.value) >= 0
					};
				}
			},
			set : function (config, doc, name, value, body) {
				var allOptions = [],
					currentOptions = [],
					currentOptionValues = [],
					chosenOptions = [],
					addOptions = [],
					remOptions = [],
					strValues = [],
					bodyStrValues = [];

				strValues = getStringValues(config, value);

				if (config.optionGroups) {
					allOptions = Array.prototype.concat.apply(
						[],
						config.optionGroups.map(function (optG) { return optG.options || [] ;})
					);
				} else {
					allOptions = config.options;
				}

				currentOptions = allOptions.filter(matchStrValues(strValues));
				currentOptionValues = currentOptions.map(getValue);

				if (config.multiple) {
					bodyStrValues = body.value;
				} else {
					bodyStrValues = [body.value];
				}

				chosenOptions = allOptions.filter(matchStrValues(bodyStrValues));

				addOptions = chosenOptions.filter(function (option) {
					return currentOptionValues.indexOf(option.value) < 0;
				});

				remOptions = currentOptions.filter(function (option) {
					return bodyStrValues.indexOf(option.value) < 0;
				});

				remOptions.forEach(function (option) {
					if (option.set) {
						Object.keys(option.set).forEach(function (name) {
							delete doc[name];
						});
					}
				});

				addOptions.forEach(function (option) {
					if (option.set) {
						Object.keys(option.set).forEach(function (name) {
							doc[name] = option.set[name];
						});
					}
				});

				if (config.multiple && chosenOptions.length > 0) {
					return chosenOptions.map(function (option) {
						return option.json || option.value;
					});
				} else if (chosenOptions.length > 0) {
					return chosenOptions[0].json || chosenOptions[0].value;
				}
			},
			bind : function (config, metaEl, el, value) {
			}
		}
	}

	function matchStrValues(values) {
		return function (option) {
			return values.indexOf(option.value) >= 0;
		}
	}

	function getValue(option) {
		return option.value;
	}


	function getStringValues(config, value) {

		var strValues = [];

		if (value) {
			if (config.multiple && typeof value.map == "function") {
				strValues = value.map(function (value) {
					return JSON.stringify(value);
				});
			} else if (typeof value == "object") {
				strValues = [JSON.stringify(value)];
			} else {
				strValues = [value.toString()];
			}
		}

		return strValues;
	}
});
