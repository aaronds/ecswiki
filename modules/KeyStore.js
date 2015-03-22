define(function () {

	return function KeyStore(controllerContext) {
		this.find = function (keyName, version) {
			var keys = (controllerContext.user.privateKeys || {})[keyName];

			if (!keys) {
				throw new Error("You do not have the '" + keyName + "' key.");
			}

			if (version) {
				key = keys.filter(function (key) {
					return key.version == version;
				}).pop();

				if (!key) {
					throw new Error("You do not have version " + version + " of the '" + keyName + "'");
				}
			} else {
				key = keys.slice().pop();
			}

			return key;
		}
	}
});
