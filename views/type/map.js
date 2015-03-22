function (doc) {
	if (!doc.type) {
		return;
	}

	emit([doc.type], null);
}
