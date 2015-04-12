define(function () {

	return function EncryptedUrlStore(controllerContext, options) {
		var database = (options || {}).database,
			design = (options || {}).design,
			jQuery = controllerContext.jQuery,
			sjcl = controllerContext.sjcl,
			urlEncryption = ((controllerContext.config || {}).urlEncryption || {});

		if (!database) {
			database = window.location.pathname.split("/")[1];
		}

		if (!design) {
			design = window.location.pathname.split("/")[3];
		}

		this.get = function (path, fn) {
			var req = null,
				encryptedUrl = null;

			encryptedUrl = encryptUrl(path);
			
			req = jQuery.getJSON("/" + database + "/" + encodeURIComponent(encryptedUrl));

			function success(data) {
				data._id = path;
				return fn(null, data);
			}

			req.done(success);

			req.fail(rationalizeError(fn, success));
		}

		this.put = function (file, data, fn) {
			var req = null,
				encryptedUrl = null;

			encryptedUrl = encryptUrl(file);
			
			req = jQuery.ajax({
				type : "PUT",
				url : "/" + database + "/" + encodeURIComponent(encryptedUrl),
				data : JSON.stringify(data),
				contentType : "application/json",
				dataType : "application/json"
			});

			function success(res) {
				data._rev = res.rev;
				data._id = file;
				return fn(null, data);
			}
			
			req.done(success);

			req.fail(rationalizeError(fn, success));
		}

		function encryptUrl(url) {
			var cryptObject = null,
				key = null;

			key = controllerContext.keyStore.find(urlEncryption.key, urlEncryption.version);	
			cryptObject = JSON.parse(sjcl.encrypt(key.password, url, urlEncryption.sjcl));

			return cryptObject.ct;	
		}

		this.getId = encryptUrl;
		
		function rationalizeError(fn, success) {
			return function (err) {
				if (err.status >= 200 && err.status < 300) {
					try {
						return success(JSON.parse(err.responseText));
					} catch (e) {
					}

					return fn(null, err.responseText);
				} else if (err.responseJSON) {
					return fn(err.responseJSON);
				} else {
					return fn(err || "Failed",null);
				}
			};
		}
	}
});
