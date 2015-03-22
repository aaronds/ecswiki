function (doc) {
	if (!doc.type || doc.type != "Message") {
		return;
	}

	emit([doc.to, doc.timestamp], null);
}
