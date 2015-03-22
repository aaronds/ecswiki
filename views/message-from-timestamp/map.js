function (doc) {
	if (!doc.type || doc.type != "Message") {
		return;
	}

	emit([doc.from, doc.timestamp], null);
}
