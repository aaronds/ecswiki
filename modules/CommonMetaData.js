define(function () {

	return function CommonMetaData(controllerContext) {
		var jQuery = controllerContext.jQuery,
			config = controllerContext.config,
			string = controllerContext.string;

		if (!controllerContext.metaDataTypes) {
			controllerContext.metaDataTypes = {};
		}

		function getMetaConfig(config, doc) {
			var key = null,
				metaConfig = {},
				hasMeta = false;

			for (key in config.metaData || {}) {
				if (config.metaData.hasOwnProperty(key)) {
					metaConfig[key] = config.metaData[key];
					hasMeta = true;
				}
			}

			for (key in ((doc.config || {}).metaData || {})) {
				if (doc.config.metaData.hasOwnProperty(key)) {
					metaConfig[key] = doc.config.metaData[key];
					hasMeta = true;
				}
			}

			if (hasMeta) {
				return metaConfig;
			}

			return false;
		}

		this.get = function (doc) {
			var metaData = doc.metaData || {},
				metaDataTypes = controllerContext.metaDataTypes,
				metaFields = [],
				metaConfig = null;

			metaConfig = getMetaConfig(config, doc);

			if (!metaConfig) {
				return [];
			}

			metaFields = Object.keys(metaConfig).map(function (name) {
				var metaFieldConfig = metaConfig[name],
					metaValue = metaData[name],
					metaObject = null;

				if (!metaFieldConfig) {
					return;
				}

				metaObject = {
					name : name,
					type : metaFieldConfig.type,
					title : metaFieldConfig.title || string.upperCaseFirst(name),
					value : metaDataTypes[metaFieldConfig.type].get(metaFieldConfig, doc, name, metaValue)
				};

				metaObject["type" + string.upperCaseFirst(metaFieldConfig.type)] = true;

				return metaObject;
			}).filter(Boolean);

			return metaFields;
		}

		this.set = function (doc, body) {
			var metaDataBody = body.metaData || {},
				metaDataTypes = controllerContext.metaDataTypes,
				metaData = doc.metaData || {},
				metaConfig = null;

			metaConfig = getMetaConfig(config, doc);

			if (!metaConfig) {
				return doc;
			}

			Object.keys(metaConfig).forEach(function (name) {
				var metaDataValue = metaData[name],
					metaFieldConfig = metaConfig[name];

				if (!metaFieldConfig) {
					return;
				}

				metaData[name] = metaDataTypes[metaFieldConfig.type].set(metaFieldConfig, doc, name, metaDataValue, metaDataBody[name]);
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
		
		controllerContext.metaDataTypes.date = {
			get : function (config, doc, name, value) {
				return value;
			},
			set : function (config, doc, name, value, body) {
				return body.value;
			}
		};
		
		controllerContext.metaDataTypes.number = {
			get : function (config, doc, name, value) {
				return {
					number : value,
					max : config.max,
					min : config.min,
					step : config.step
				}
			},
			set : function (config, doc, name, value, body) {
				return body.value;
			}
		};

		controllerContext.metaDataTypes.constant = {
			get : function (config, doc, name, value) {
				return value;
			},
			set : function (config, doc, name, value, body) {
				return config.value;
			}
		}

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
