function (doc) {
	if (!doc.type || doc.type != "Page") {
		return;
	}

	if (!doc.encryption) {
		return;
	}

	emit([doc.encryption.key], null);
}
