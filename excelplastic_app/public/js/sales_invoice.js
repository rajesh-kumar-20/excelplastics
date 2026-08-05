frappe.ui.form.on('Sales Invoice', {
    refresh: function(frm) {
        //  Try removing unwanted "Maintenance Schedule" button
        let attempts = 0;
        const max_attempts = 10;
        const interval = setInterval(() => {
            frm.remove_custom_button('Maintenance Schedule', 'Create');
            attempts++;
            if (attempts >= max_attempts) clearInterval(interval);
        }, 300);
        // Add "Sales Order" button in Draft mode
        if (frm.doc.docstatus === 0) {
            frm.page.add_inner_button('Sales Order', () => {
                if (!frm.doc.customer) {
                    frappe.msgprint(__('Please select a Customer.'));
                    return;
                }
                get_items_from_sales_order(frm);
            }, 'Get Items From');
        }
    }
});
function get_items_from_sales_order(frm) {
    frappe.prompt([
        { fieldname: 'item_code', label: 'Item Code', fieldtype: 'Link', options: 'Item', reqd: 1 },
        { fieldname: 'customer', label: 'Customer', fieldtype: 'Link', options: 'Customer', default: frm.doc.customer }
    ], (filters) => {
        frappe.call({
            method: 'excelplastic_app.api.get_sales_orders_by_item',  // Make sure this is defined on server side
            args: filters,
            callback: function (r) {
                show_sales_order_dialog(frm, r.message);
            }
        });
    });
}
function show_sales_order_dialog(frm, data) {
    if (!data || data.length === 0) {
        frappe.msgprint(`No matching Sales Orders found.`);
        return;
    }
    const unique_id = `select-all-${frappe.utils.get_random()}`;
    let table_html = `
        <div style="max-height: 400px; overflow-y: auto;">
        <table class="table table-bordered">
            <thead>
                <tr>
                    <th><input type="checkbox" id="${unique_id}"></th>
                    <th>Sales Order</th>
                    <th>Item</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Quantity</th>
                </tr>
            </thead>
            <tbody>`;
    data.forEach(order => {
        const item = order.items && order.items[0];
        table_html += `
            <tr>
                <td><input type="checkbox" class="so-checkbox" data-so="${order.name}"></td>
                <td><a href="/app/sales-order/${order.name}" target="_blank">${order.name}</a></td>
                <td>${item ? (item.item_name || item.item_code) : ''}</td>
                <td>${frappe.format(order.transaction_date, { fieldtype: 'Date' }) || 'N/A'}</td>
                <td>${order.customer || ''}</td>
                <td>${item ? item.qty : ''}</td>
            </tr>`;
    });
    table_html += '</tbody></table></div>';
    const d = new frappe.ui.Dialog({
        title: 'Select Sales Orders',
        fields: [{ fieldname: 'html_area', fieldtype: 'HTML', options: table_html }],
        primary_action_label: 'Add Items',
        primary_action() {
            const selected = [];
            $(d.$wrapper).find('.so-checkbox:checked').each(function () {
                selected.push($(this).data('so'));
            });
            frm.clear_table('items');
            data.forEach(order => {
                if (selected.includes(order.name)) {
                    order.items.forEach(item => {
                        const row = frm.add_child('items');
                        frappe.model.set_value(row.doctype, row.name, 'item_code', item.item_code)
                            .then(() => {
                                frm.script_manager.trigger("item_code", row.doctype, row.name);
                                frappe.model.set_value(row.doctype, row.name, 'qty', item.qty);
                                frappe.model.set_value(row.doctype, row.name, 'rate', item.rate);
                                // frappe.model.set_value(row.doctype, row.name, 'sales_order', order.name);
                                frappe.model.set_value(row.doctype, row.name, 'so_detail', item.name);
                            });
                    });
                }
            });
            frm.refresh_field('items');
            d.hide();
        }
    });
    d.show();
    // 🖱️ Select All checkbox functionality
    setTimeout(() => {
        d.$wrapper.find('.modal-dialog').css('max-width', '70%');
        const selectAll = d.$wrapper.find(`#${unique_id}`);
        const checkboxes = d.$wrapper.find('.so-checkbox');
        selectAll.on('change', function () {
            checkboxes.prop('checked', $(this).is(':checked'));
        });
    }, 100);
}

frappe.ui.form.on('Sales Invoice', {
    onload: function(frm) {
        // Only run in Draft
        if (frm.doc.docstatus === 0) {
            // Only fetch if template not already selected
            if (!frm.doc.custom_template) {
                frappe.db.get_value(
                    'Declaration',
                    { 
                        is_default: 1,
                        type: "Sales"
                    },
                    ['name', 'declaration'],
                    function(r) {
                        if (r) {
                            frm.set_value('custom_template', r.name);
                            // frm.set_value('custom_declarations', r.declaration);
                        }
                    }
                );
            }
        }
    }
});