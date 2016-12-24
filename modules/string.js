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
		titlize : function (docId) {
			return docId.split(/[_\-\/]+/g).join(" ");
		},
		strcmp : function (a, b) {
			if (a > b) {
				return 1;
			} else if (a < b) {
				return -1;
			} else {
				return 0;
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
