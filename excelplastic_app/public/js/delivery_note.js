frappe.ui.form.on('Delivery Note', {
    refresh: function(frm) {
        if (frm.doc.docstatus === 0) {
            frm.page.add_inner_button('Sales Order', () => {
                if (!frm.doc.customer) {
                    frappe.msgprint(__('Please select a Customer.'));
                    return;
                }
                get_item_for_delivery_note(frm);
            }, 'Get Items From');
        }

        function get_item_for_delivery_note(frm) {
            frappe.prompt([
                {
                    fieldname: 'item_code',
                    label: 'Item Code',
                    fieldtype: 'Link',
                    options: 'Item',
                    reqd: 1
                },
                {
                    fieldname: 'customer',
                    label: 'Customer',
                    fieldtype: 'Link',
                    options: 'Customer',
                    default: frm.doc.customer,
                    read_only: 1
                }
            ], (filters) => {
                frappe.call({
                    method: 'get_item_for_delivery_note',
                    args: filters,
                    callback: function (r) {
                        show_items_dialog(frm, r.message, 'Sales Order');
                    }
                });
            });
        }
        function show_items_dialog(frm, data, source_label) {
            if (!data || data.length === 0) {
                frappe.msgprint(`No matching ${source_label}s found.`);
                return;
            }

            // CSS to remove spinner from number inputs
            const styleTag = `
                <style>
                    .no-spinner::-webkit-inner-spin-button,
                    .no-spinner::-webkit-outer-spin-button {
                        -webkit-appearance: none;
                        margin: 0;
                    }

                    .no-spinner {
                        -moz-appearance: textfield;
                    }
                </style>
            `;

            let table_html = styleTag + `<div style="max-height: 400px; overflow-y: auto;"><table class="table table-bordered">
                <thead>
                    <tr>
                        <th><input type="checkbox" id="select-all-so"></th>
                        <th>${source_label}</th>
                        <th>Item</th>
                        <th>Date</th>
                        <th>Customer PO</th>
                        <th>Order Qty</th>
                        <th>Allocated Qty</th>
                    </tr>
                </thead><tbody>`;

            data.forEach(order => {
                (order.items || []).forEach(item => {
                    table_html += `<tr>
                        <td><input type="checkbox" class="so-checkbox" data-so="${order.name}" data-so-detail="${item.name}"></td>
                        <td><a href="/app/${source_label.toLowerCase().replace(/ /g, '-')}/${order.name}" target="_blank">${order.name}</a></td>
                        <td>${item.item_name || item.item_code}</td>
                        <td>${frappe.format(order.transaction_date, { fieldtype: 'Date' }) || 'N/A'}</td>
                        <td>${order.po_no || ''}</td>
                        <td>${item.qty || ''}</td>
                        <td>
                            <input type="number" class="form-control allocated-qty no-spinner" 
                                data-item='${JSON.stringify(item)}' 
                                data-so="${order.name}" 
                                data-so-detail="${item.name}" 
                                placeholder="${item.qty}" 
                                min="0" style="width: 100px;" />
                        </td>
                    </tr>`;
                });
            });

            table_html += '</tbody></table></div>';

            const d = new frappe.ui.Dialog({
                title: `Select ${source_label} Items for ${frm.doc.customer_name || frm.doc.customer}`,
                fields: [{ fieldname: 'html_area', fieldtype: 'HTML', options: table_html }],
                primary_action_label: 'Add Items',
                primary_action() {
                    const selected_items = [];

                    $(d.$wrapper).find('.so-checkbox:checked').each(function () {
                        const so = $(this).data('so');
                        const so_detail = $(this).data('so-detail');
                        const $row = $(this).closest('tr');
                        const input = $row.find('.allocated-qty');
                        const item_data = JSON.parse(input.attr('data-item'));

                        const allocated_qty = parseFloat(input.val()) || item_data.qty;

                        selected_items.push({
                            item_code: item_data.item_code,
                            qty: allocated_qty,
                            sales_order: so,
                            rate: item_data.rate,
                            so_detail: so_detail
                        });
                    });

                    // Remove blank rows only
                    frm.doc.items = frm.doc.items.filter(row => row.item_code);
                    frm.refresh_field('items');

                    selected_items.forEach(item => {
                        const row = frm.add_child('items');
                        frappe.model.set_value(row.doctype, row.name, 'item_code', item.item_code).then(() => {
                            frm.script_manager.trigger("item_code", row.doctype, row.name);
                            frappe.model.set_value(row.doctype, row.name, 'qty', item.qty);
                            frappe.model.set_value(row.doctype, row.name, 'rate', item.rate);
                            frappe.model.set_value(row.doctype, row.name, 'sales_order', item.sales_order);
                            frappe.model.set_value(row.doctype, row.name, 'so_detail', item.so_detail);
                            frappe.model.set_value(row.doctype, row.name, 'against_sales_order', item.sales_order);
                        });
                    });

                    frm.refresh_field('items');
                    d.hide();
                }
            });

            d.show();

            // Style dialog and Select All checkbox
            setTimeout(() => {
                d.$wrapper.find('.modal-dialog').css('max-width', '80%');
                const selectAll = d.$wrapper.find('#select-all-so');
                const checkboxes = d.$wrapper.find('.so-checkbox');
                selectAll.on('change', function () {
                    checkboxes.prop('checked', $(this).is(':checked'));
                });
            }, 100);
        }
    }
});
