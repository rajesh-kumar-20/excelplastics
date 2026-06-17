frappe.ui.form.on('Purchase Invoice', {
    refresh: function(frm) {
        if (frm.doc.docstatus === 0) {
            frm.page.add_inner_button('Purchase Order', () => {
                if (!frm.doc.supplier) {
                    frappe.msgprint(__('Please select a Supplier.'));
                    return;
                }
                get_purchase_items(frm);
            }, 'Get Items From');
        }
    }
});

function get_purchase_items(frm) {
    frappe.prompt([
        {
            fieldname: 'item_code',
            label: 'Item Code',
            fieldtype: 'Link',
            options: 'Item',
            reqd: 1
        },
        {
            fieldname: 'supplier',
            label: 'Supplier',
            fieldtype: 'Link',
            options: 'Supplier',
            default: frm.doc.supplier,
            read_only: 1
        }
    ], (filters) => {
        frappe.call({
            method: 'get_purchase_orders_by_item',
            args: filters,
            callback: function (r) {
                show_items_dialog(frm, r.message, 'Purchase Order');
            }
        });
    });
}

function show_items_dialog(frm, data, source_label) {
    if (!data || data.length === 0) {
        frappe.msgprint(`No matching ${source_label}s found.`);
        return;
    }

    let table_html = `
        <div style="max-height: 400px; overflow-y: auto;">
        <table class="table table-bordered">
            <thead>
                <tr>
                    <th><input type="checkbox" id="select-all-source"></th>
                    <th>${source_label}</th>
                    <th>Item</th>
                    <th>Date</th>
                    <th>Supplier</th>
                    <th>Quantity</th>
                </tr>
            </thead>
            <tbody>`;

    data.forEach(doc => {
        const item = doc.items && doc.items[0];
        table_html += `
            <tr>
                <td><input type="checkbox" class="source-checkbox" data-source="${doc.name}"></td>
                <td><a href="/app/${source_label.toLowerCase().replace(/ /g, '-')}/${doc.name}" target="_blank">${doc.name}</a></td>
                <td>${item ? (item.item_name || item.item_code) : ''}</td>
                <td>${frappe.format(doc.transaction_date, { fieldtype: 'Date' }) || 'N/A'}</td>
                <td>${doc.supplier || ''}</td>
                <td>${doc.qty || ''}</td>
            </tr>`;
    });

    table_html += '</tbody></table></div>';

    const d = new frappe.ui.Dialog({
        title: `Select ${source_label}s`,
        fields: [{ fieldname: 'html_area', fieldtype: 'HTML', options: table_html }],
        primary_action_label: 'Add Items',
        primary_action() {
            const selected = [];
            $(d.$wrapper).find('.source-checkbox:checked').each(function () {
                selected.push($(this).data('source'));
            });

            frm.clear_table('items');

            data.forEach(doc => {
                if (selected.includes(doc.name)) {
                    doc.items.forEach(item => {
                        const row = frm.add_child('items');
                        frappe.model.set_value(row.doctype, row.name, 'item_code', item.item_code)
                            .then(() => {
                                frm.script_manager.trigger("item_code", row.doctype, row.name);
                                frappe.model.set_value(row.doctype, row.name, 'qty', item.qty);
                                frappe.model.set_value(row.doctype, row.name, 'purchase_order', doc.name);
                                frappe.model.set_value(row.doctype, row.name, 'po_detail', item.name);
                            });
                    });
                }
            });

            frm.refresh_field('items');
            d.hide();
        }
    });

    d.show();

    setTimeout(() => {
        d.$wrapper.find('.modal-dialog').css('max-width', '70%');
        const selectAll = d.$wrapper.find('#select-all-source');
        const checkboxes = d.$wrapper.find('.source-checkbox');
        selectAll.on('change', function () {
            checkboxes.prop('checked', $(this).is(':checked'));
        });
    }, 100);
}
frappe.ui.form.on('Purchase Invoice', {

    onload: function(frm) {

        // Only run in Draft
        if (frm.doc.docstatus === 0) {

            // Only fetch if template not already selected
            if (!frm.doc.custom_template) {

                frappe.db.get_value(
                    'Declaration',
                    { 
                        is_default: 1,
                        type: "Purchase"
                    },
                    ['name', 'declaration'],
                    function(r) {

                        if (r) {
                            frm.set_value('custom_template', r.name);
                        }

                    }
                );

            }
        }

    }

});