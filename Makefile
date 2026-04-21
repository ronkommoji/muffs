# Same as `muffs-setup` — install Python + dashboard dependencies once.

.PHONY: install
install:
	python -m pip install -e .
	cd dashboard && npm install
