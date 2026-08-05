const sales_order_settings = frappe.listview_settings["Sales Order"] || {};
const original_onload = sales_order_settings.onload;

frappe.listview_settings["Sales Order"] = {
	...sales_order_settings,

	onload(listview) {

		if (original_onload) {
			original_onload(listview);
		}

		if ($("#custom-item-filter").length) {
			return;
		}

		let syncing = false;

		const wrapper = $(
			`<div id="custom-item-filter" style="width:180px;margin-left:8px;"></div>`
		);

		wrapper.appendTo(listview.filter_area.standard_filters_wrapper);

		const item_link = frappe.ui.form.make_control({
			parent: wrapper,
			df: {
				fieldtype: "Link",
				fieldname: "item_code_filter",
				options: "Item",
				label: "",
				placeholder: __("Select Item")
			},
			render_input: true
		});

		item_link.refresh();

		item_link.$wrapper.find(".control-label").remove();

		item_link.$wrapper.find(".frappe-control").css({
			padding: "12px",
			margin: "2px"
		});

		// Link -> Filter
		item_link.$input.on("change", function () {

			if (syncing) return;

			const value = item_link.get_value();

			cur_list.filter_area.remove("item_code");

			if (value) {
				cur_list.filter_area.add([
					["Sales Order Item", "item_code", "=", value]
				]);
			}
		});

		// Filter -> Link
		const original_filter_change = cur_list.filter_area.filter_list.on_change;

		cur_list.filter_area.filter_list.on_change = function () {

			if (original_filter_change) {
				original_filter_change.apply(this, arguments);
			}

			syncing = true;

			const filters = cur_list.filter_area.filter_list.get_filters();

			const row = filters.find(f =>
				f[0] === "Sales Order Item" &&
				f[1] === "item_code"
			);

			if (row) {
				if (item_link.get_value() !== row[3]) {
					item_link.set_value(row[3]);
				}
			} else {
				item_link.set_value("");
			}

			syncing = false;
		};
	}
};