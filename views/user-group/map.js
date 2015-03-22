function (doc) {
	var key = null;

	if (!doc.type || doc.type != "User") {
		return;
	}

	if (!doc.groups) {
		return;
	}

	for(key in doc.groups) {
		if (doc.groups.hasOwnProperty(key)) {
			emit([key], null);
		}
	}
}



