define(function () {
	return {
		upperCaseFirst : function (str) {
			str = str.toString();

			return str.charAt(0).toUpperCase() + str.slice(1);
		},
		concatFrom : function (doc) {
			return function (text, field) {
				return text + doc[field];
			}
		},
		fromBits : function (sjcl, arr) {
			var out = "", bl = sjcl.bitArray.bitLength(arr), i, tmp;
			for (i=0; i<bl/8; i++) {
			  if ((i&3) === 0) {
				tmp = arr[i/4];
			  }
			  out += String.fromCharCode(tmp >>> 24);
			  tmp <<= 8;
			}
			return out;
		}
	}
});
