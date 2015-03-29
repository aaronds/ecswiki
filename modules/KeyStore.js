define(function () {

	return function KeyStore(controllerContext) {
		this.find = function (keyName, version) {
			var keys = (controllerContext.user.privateKeys || {})[keyName],
				error = null;

			if (!keys) {
				error = new Error("You do not have the '" + keyName + "' key.");
				error.requiredKey = keyName;
				throw error;
			}

			if (version) {
				key = keys.filter(function (key) {
					return key.version == version;
				}).pop();

				if (!key) {
					error = new Error("You do not have version " + version + " of the '" + keyName + "'");
					throw error; 
				}
			} else {
				key = keys.slice().pop();
			}

			return key;
		}
	}
});
