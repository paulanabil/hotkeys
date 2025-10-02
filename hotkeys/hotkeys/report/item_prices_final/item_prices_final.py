# Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
# License: GNU General Public License v3. See license.txt

import frappe
from frappe import _
from frappe.query_builder.functions import IfNull, Sum, Lower
from frappe.utils import flt
from pypika.terms import Criterion

def execute(filters=None):
	if not filters:
		filters = {}

	frappe.log_error(f"Execute filters: {filters}", "Item Prices Final Debug")

	if not filters.get("item_name") or len(filters.get("item_name").strip()) < 2:
		frappe.log_error("Item_name filter missing or too short, returning empty result", "Item Prices Final Debug")
		return get_columns(filters), []

	columns = get_columns(filters)
	item_map = get_item_details(filters)
	pl = get_price_list()
	data = []

	for item in sorted(item_map):
		data.append([
			item,
			pl.get(item, {}).get("Buying"),
			item_map[item]["item_group"],
			item_map[item]["description"],
			pl.get(item, {}).get("Selling"),
		])

	return columns, data

def get_columns(filters):
	return [
		_("Item") + ":Link/Item:300",
		_("Purchase Price List") + "::180",
		_("Item Group") + ":Link/Item Group:125",
		_("Description") + "::150",
		_("Sales Price List") + "::1440",
	]

def get_item_details(filters):
	item_map = {}
	frappe.log_error(f"Received filters in get_item_details: {filters}", "Item Prices Final Debug")

	item = frappe.qb.DocType("Item")
	query = (
		frappe.qb.from_(item)
		.select(item.name, item.item_group, item.item_name, item.description, item.brand, item.stock_uom)
		.orderby(item.item_code, item.item_group)
	)

	if filters.get("items") == "Enabled Items only":
		query = query.where(item.disabled == 0)
	elif filters.get("items") == "Disabled Items only":
		query = query.where(item.disabled == 1)

	if filters.get("item_name") and filters.get("item_name").strip():
		search_terms = filters.get("item_name").strip().split()
		frappe.log_error(f"Search terms: {search_terms}", "Item Prices Final Debug")

		conditions = [Lower(item.item_name).like(f"%{term.lower()}%") for term in search_terms]
		if conditions:
			combined_condition = Criterion.all(conditions)
			query = query.where(combined_condition)

		sql_query = str(query)
		frappe.log_error("Item Prices Final Debug", f"SQL Query: {sql_query}")
	else:
		frappe.log_error("Item Prices Final Debug", "No item_name filter provided or it is empty")

	results = query.run(as_dict=True)
	frappe.log_error("Item Prices Final Debug", f"Query returned {len(results)} items")
	if results:
		sample_items = [r.item_name[:20] for r in results[:3]]
		frappe.log_error("Item Prices Final Debug", f"Sample items: {sample_items}")

	for i in results:
		item_map.setdefault(i.name, i)

	return item_map

def get_price_list():
	rate = {}
	ip = frappe.qb.DocType("Item Price")
	pl = frappe.qb.DocType("Price List")
	cu = frappe.qb.DocType("Currency")

	price_list = (
		frappe.qb.from_(ip)
		.from_(pl)
		.from_(cu)
		.select(
			ip.item_code,
			ip.buying,
			ip.selling,
			(IfNull(cu.symbol, ip.currency)).as_("currency"),
			ip.price_list_rate,
			ip.price_list,
		)
		.where((ip.price_list == pl.name) & (pl.currency == cu.name) & (pl.enabled == 1))
	).run(as_dict=True)

	for d in price_list:
		if d.buying:
			# Format purchase price as a plain number
			d.update({"price": f"{round(d.price_list_rate, 2)}"})
		elif d.selling:
			# Format sales price as (price list name price)
			d.update({"price": f"({d.price_list} {round(d.price_list_rate, 2)})"})
		d.pop("currency")
		d.pop("price_list_rate")
		d.pop("price_list")

		if d.price:
			rate.setdefault(d.item_code, {}).setdefault("Buying" if d.buying else "Selling", []).append(d.price)

	item_rate_map = {}
	for item in rate:
		for kind in rate[item]:
			if kind == "Selling":
				# Combine all selling prices with their price list names
				item_rate_map.setdefault(item, {}).setdefault(kind, " ".join(rate[item][kind]))
			else:
				# Use the first buying price as a plain number
				item_rate_map.setdefault(item, {}).setdefault(kind, rate[item][kind][0] if rate[item][kind] else "")

	return item_rate_map

def get_last_purchase_rate():
	item_last_purchase_rate_map = {}
	po = frappe.qb.DocType("Purchase Order")
	pr = frappe.qb.DocType("Purchase Receipt")
	pi = frappe.qb.DocType("Purchase Invoice")
	po_item = frappe.qb.DocType("Purchase Order Item")
	pr_item = frappe.qb.DocType("Purchase Receipt Item")
	pi_item = frappe.qb.DocType("Purchase Invoice Item")

	query = (
		frappe.qb.from_(
			(
				frappe.qb.from_(po)
				.from_(po_item)
				.select(po_item.item_code, po.transaction_date.as_("posting_date"), po_item.base_rate)
				.where((po.name == po_item.parent) & (po.docstatus == 1))
			)
			+ (
				frappe.qb.from_(pr)
				.from_(pr_item)
				.select(pr_item.item_code, pr.posting_date, pr_item.base_rate)
				.where((pr.name == pr_item.parent) & (pr.docstatus == 1))
			)
			+ (
				frappe.qb.from_(pi)
				.from_(pi_item)
				.select(pi_item.item_code, pi.posting_date, pi_item.base_rate)
				.where((pi.name == pi_item.parent) & (pi.docstatus == 1) & (pi.update_stock == 1))
			)
		)
		.select("*")
		.orderby("item_code", "posting_date")
	)

	for d in query.run(as_dict=True):
		item_last_purchase_rate_map[d.item_code] = d.base_rate

	return item_last_purchase_rate_map

def get_item_bom_rate():
	item_bom_map = {}
	bom = frappe.qb.DocType("BOM")
	bom_data = (
		frappe.qb.from_(bom)
		.select(bom.item, (bom.total_cost / bom.quantity).as_("bom_rate"))
		.where((bom.is_active == 1) & (bom.is_default == 1))
	).run(as_dict=True)

	for d in bom_data:
		item_bom_map.setdefault(d.item, flt(d.bom_rate))

	return item_bom_map

def get_valuation_rate():
	item_val_rate_map = {}
	bin = frappe.qb.DocType("Bin")
	bin_data = (
		frappe.qb.from_(bin)
		.select(
			bin.item_code,
			(Sum(bin.actual_qty * bin.valuation_rate) / Sum(bin.actual_qty)).as_("val_rate"),
		)
		.where(bin.actual_qty > 0)
		.groupby(bin.item_code)
	).run(as_dict=True)

	for d in bin_data:
		item_val_rate_map.setdefault(d.item_code, d.val_rate)

	return item_val_rate_map
