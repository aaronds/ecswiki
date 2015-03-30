define(function () {

	return function CouchDb(controllerContext, options) {
		var database = (options || {}).database,
			design = (options || {}).design,
			jQuery = controllerContext.jQuery;

		if (!database) {
			database = window.location.pathname.split("/")[1];
		}

		if (!design) {
			design = window.location.pathname.split("/")[3];
		}

		this.get = get;
		this.put = put;
		this.indexKey = function (name, key, fn) {
			var req = jQuery.getJSON("/" + database + "/_design/" + design + "/_view/" + name + "?key=" + encodeURIComponent(JSON.stringify(key)) + "&include_docs=true&reduce=false");

			req.done(function (data) {
				var results = data.rows.map(function (row) {
					return row.doc;
				});

				return fn(null, results);
			});

			req.fail(rationalizeError(fn));

			return req;
		}
		this.countKey = function (name, key, fn) {
			var req = null,
				parts = null;
			
			parts = [
				"reduce=true",
				"key=" + encodeURIComponent(JSON.stringify(key))
			];
			
			function success(data) {
				return fn(null, ((data.rows || [])[0] || {}).value || 0);
			}

			req = jQuery.getJSON("/" + database + "/_design/" + design + "/_view/" + name + "?" + parts.join("&"));
			req.done(success);
			req.fail(rationalizeError(fn, success));

			return req;
		}

		this.indexRange = function (name, from, to, offset, limit, fn) {
			var req = null,
				parts = ["include_docs=true", "reduce=false"];

			parts = buildStartEnd(parts, from, to);

			if (offset) {
				parts.push("skip=" + offset);
			}

			if (limit) {
				parts.push("limit=" + limit);
			}

			req = jQuery.getJSON("/" + database + "/_design/" + design + "/_view/" + name + "?" + parts.join("&"));

			function success(data) {
				var results = data.rows.map(function (row) {
					return row.doc;
				});

				return fn(null, results);
			}

			req.done(success);
			req.fail(rationalizeError(fn, success));

			return req;
		}

		this.countRange = function (name, from, to, fn) {
			var req = null,
				parts = ["reduce=true"];

			parts = buildStartEnd(parts, from, to);	
			
			function success(data) {
				return fn(null, ((data.rows || [])[0] || {}).value || 0);
			}

			req = jQuery.getJSON("/" + database + "/_design/" + design + "/_view/" + name + "?" + parts.join("&"));
			req.done(success);
			req.fail(rationalizeError(fn, success));

			return req;
		}

		function get(path, fn) {
			var req = jQuery.getJSON("/" + database + "/" + path);

			function success(data) {
				return fn(null, data);
			}

			req.done(success);

			req.fail(rationalizeError(fn, success));
		}

		function put(file, data, fn) {
			var req = jQuery.ajax({
				type : "PUT",
				url : "/" + database + "/" + file,
				data : JSON.stringify(data),
				contentType : "application/json",
				dataType : "application/json"
			});

			function success(res) {
				data._rev = res.rev;
				data._id = res.id;
				return fn(null, data);
			}
			
			req.done(success);

			req.fail(rationalizeError(fn, success));
		}
			
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

		function buildStartEnd(parts, from, to) {
			var fromEdge = null,
				toEdge = null;

			if (from instanceof Array) {
				fromEdge = from[from.length - 1];
			} else {
				fromEdge = from;
			}

			if (to instanceof Array) {
				toEdge = to[to.length - 1];
			} else {
				toEdge = to;
			}

			if (fromEdge < toEdge) {
				parts.push("decending=true");
			}

			parts.push("startkey=" + encodeURIComponent(JSON.stringify(from)));
			parts.push("endkey=" + encodeURIComponent(JSON.stringify(to)));
			return parts;
		}
	}
});
