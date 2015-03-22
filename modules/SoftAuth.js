define(function () {

	return function SoftAuth(controllerContext) {
		this.isUser = function () {
			return controllerContext.user ? true : false;
		}

		this.hasPrivateKeys = function () {
			if (!controllerContext.user) {
				return false;
			}
			
			return controllerContext.user.privateKeys ? true : false;
		}
	}
});
