// Copyright (c) 2026, Rajesh Kumar and contributors
// For license information, please see license.txt

frappe.ui.form.on('Proforma Invoice', {
    refresh: function(frm) {

        if (frm.doc.docstatus === 1) {

            frm.add_custom_button('Email', function() {
                frm.email_doc();
            });

        }
    }
});

frappe.ui.form.on('Proforma Invoice', {
    refresh(frm) {
        add_sales_order_button(frm);
        calculate_totals(frm);
    },
    refresh(frm) {
        frm.set_query("tax_category", function() {
            return {
                filters: {
                    custom_tax_type: "Sales"
                }
            };
        });
    },
    customer(frm) {
        if (!frm.doc.customer) return;
        set_address(frm, 'Customer', frm.doc.customer, 'customer_address', 'address_display');
        set_address(frm, 'Customer', frm.doc.customer, 'shipping_address_name', 'shipping_address');

        frappe.db.get_value('Customer', frm.doc.customer, ['tax_category', 'payment_terms']).then(res => {
            const { tax_category, payment_terms } = res.message || {};
            if (tax_category) {
                frm.set_value('tax_category', tax_category);
                apply_tax_template(frm);
            }
            if (payment_terms) {
                frm.set_value('payment_terms_template', payment_terms);
                setTimeout(() => frm.trigger('payment_terms_template'), 200);
            }
        });
    },
    company(frm) {
        if (!frm.doc.company) return;
        set_address(frm, 'Company', frm.doc.company, 'company_address', 'company_address_display');
        fetch_conversion_rate(frm);
    },
    transaction_date(frm) {
        fetch_conversion_rate(frm);
        fetch_price_list_rate(frm);
        if (frm.doc.payment_terms_template) frm.trigger('payment_terms_template');
    },
    grand_total(frm) {
        if (frm.doc.payment_terms_template && frm.doc.payment_schedule?.length) {
            frm.trigger('payment_terms_template');
        }
    },
    tax_category: apply_tax_template,
    taxes_and_charges: trigger_taxes_and_charges,
    selling_price_list: fetch_price_list_rate,
    currency(frm) {
        fetch_conversion_rate(frm);
        if (frm.doc.selling_price_list) frm.trigger('selling_price_list');
        if (frm.doc.taxes_and_charges) frm.trigger('taxes_and_charges');
        if (frm.doc.payment_terms_template) frm.trigger('payment_terms_template');
    },
    delivery_date(frm) {
        if (!frm.doc.delivery_date) return;
        frm.doc.items.forEach(row => row.delivery_date = frm.doc.delivery_date);
        frm.refresh_field("items");
    },
    tc_name(frm) {
        if (!frm.doc.tc_name) return;
        frappe.db.get_value('Terms and Conditions', frm.doc.tc_name, 'terms')
            .then(r => r.message?.terms && frm.set_value('terms', r.message.terms));
    },
    payment_terms_template(frm) {
        if (!(frm.doc.payment_terms_template && frm.doc.company && frm.doc.transaction_date)) return;
        frappe.call({
            method: 'erpnext.controllers.accounts_controller.get_payment_terms',
            args: {
                terms_template: frm.doc.payment_terms_template,
                company: frm.doc.company,
                grand_total: frm.doc.grand_total || 0,
                posting_date: frm.doc.transaction_date
            },
            callback: r => {
                if (r.message) {
                    frm.clear_table('payment_schedule');
                    r.message.forEach(term => frm.add_child('payment_schedule', term));
                    frm.refresh_field('payment_schedule');
                }
            }
        });
    }
});
// Item Table Logic
frappe.ui.form.on("Proforma Invoice Item", {
    qty: calculate_item_amount,
    rate: calculate_item_amount,
    uom(frm, cdt, cdn) {
        const row = frappe.get_doc(cdt, cdn);
        if (!row.item_code || !row.uom) return;
        frappe.call({
            method: "erpnext.stock.get_item_details.get_conversion_factor",
            args: { item_code: row.item_code, uom: row.uom },
            callback: r => {
                const cf = parseFloat(r.message?.conversion_factor) || 1.0;
                frappe.model.set_value(cdt, cdn, "conversion_factor", cf);
                calculate_item_amount(frm, cdt, cdn);
            }
        });
    },
    item_code(frm, cdt, cdn) {
        const row = frappe.get_doc(cdt, cdn);
        if (!row.item_code) return;
        if (!row.qty) frappe.model.set_value(cdt, cdn, "qty", 1);
        frappe.model.set_value(cdt, cdn, "conversion_factor", 1.0);
        frappe.call({
            method: "frappe.client.get",
            args: { doctype: "Item", name: row.item_code },
            callback: r => {
                const item = r.message;
                if (item) {
                    Object.assign(row, {
                        item_name: item.item_name,
                        description: item.description || "",
                        uom: item.stock_uom,
                        stock_uom: item.stock_uom,
                        warehouse: item.default_warehouse,
                        item_tax_template: item.item_tax_template,
                    });
                    frm.refresh_field("items");
                }
            }
        });
        if (frm.doc.selling_price_list) {
            frappe.call({
                method: "frappe.client.get_list",
                args: {
                    doctype: "Item Price",
                    filters: {
                        item_code: row.item_code,
                        price_list: frm.doc.selling_price_list
                    },
                    fields: ["price_list_rate"],
                    limit_page_length: 1
                },
                callback: r => {
                    if (r.message?.length) {
                        frappe.model.set_value(cdt, cdn, "rate", r.message[0].price_list_rate);
                    }
                }
            });
        }
    },
    items_add(frm, cdt, cdn) {
        const row = frappe.get_doc(cdt, cdn);
        frappe.model.set_value(cdt, cdn, "conversion_factor", 1.0);
        if (frm.doc.delivery_date) {
            frappe.model.set_value(cdt, cdn, "delivery_date", frm.doc.delivery_date);
        }
    }
});
// Tax Table
frappe.ui.form.on("Sales Taxes and Charges", {
    rate: calculate_totals,
    charge_type: calculate_totals,
    tax_amount: calculate_totals,
    row_added: calculate_totals
});

function add_sales_order_button(frm) {
  if (!frm.doc.__islocal && frm.doc.docstatus === 1) {
    frm.add_custom_button("Sales Order", function () {
      frappe.model.with_doctype("Sales Order", function () {
        let so = frappe.model.get_new_doc("Sales Order");
        Object.assign(so, {
          customer: frm.doc.customer,
          transaction_date: frappe.datetime.now_date(),
          company: frm.doc.company,
          delivery_date:frm.doc.delivery_date,
          custom_despatched_through:frm.doc.despatched_through,
          currency: frm.doc.currency,
          tc_name: frm.doc.tc_name,
          payment_terms_template: frm.doc.payment_terms_template,
          tax_category: frm.doc.tax_category,
          
        });
        frm.doc.items.forEach(item => {
          let so_item = frappe.model.add_child(so, "items");
          Object.assign(so_item, {
            item_code: item.item_code,
            
            item_name: item.item_name,
            description: item.description,
            custom_remarks: item.remarks,
            custom_packing_type: item.packing_type,
            delivery_date: item.delivery_date,
            qty: item.qty,
            rate: item.rate,
            uom: item.uom,
            prevdoc_docname: item.prevdoc_docname,
            proforma_invoice: frm.doc.name,
            conversion_factor: item.conversion_factor
          });
        });
        frappe.set_route("Form", "Sales Order", so.name);
      });
    }, "Create");
  }
}

function set_address(frm, doctype, name, field, display) {
    frappe.call({
        method: "frappe.contacts.doctype.address.address.get_default_address",
        args: { doctype, name },
        callback: r => {
            if (r.message) {
                frm.set_value(field, r.message);
                frappe.call({
                    method: 'frappe.contacts.doctype.address.address.get_address_display',
                    args: { address_dict: r.message },
                    callback: res => res.message && frm.set_value(display, res.message)
                });
            }
        }
    });
}
function apply_tax_template(frm) {
    if (!(frm.doc.customer && frm.doc.company && frm.doc.tax_category)) return;
    frappe.call({
        method: "erpnext.accounts.party.set_taxes",
        args: {
            party: frm.doc.customer,
            party_type: "Customer",
            posting_date: frm.doc.transaction_date,
            company: frm.doc.company,
            tax_category: frm.doc.tax_category
        },
        callback(r) {
            if (r.message) {
                frm.set_value("taxes_and_charges", r.message);
                frm.trigger("taxes_and_charges");
            } else {
                frappe.msgprint("No Tax Rule found for this category.");
            }
        }
    });
}
function trigger_taxes_and_charges(frm) {
    if (!frm.doc.taxes_and_charges) return;
    frappe.model.with_doc("Sales Taxes and Charges Template", frm.doc.taxes_and_charges, () => {
        const tmpl = frappe.get_doc("Sales Taxes and Charges Template", frm.doc.taxes_and_charges);
        frm.clear_table("taxes");
        tmpl.taxes.forEach(t => {
            const row = frm.add_child("taxes");
            Object.keys(t).forEach(key => {
                if (!["name", "parent", "parenttype", "parentfield"].includes(key)) row[key] = t[key];
            });
        });
        frm.refresh_field("taxes");
        calculate_totals(frm);
    });
}
function calculate_item_amount(frm, cdt, cdn) {
    const row = frappe.get_doc(cdt, cdn);
    if (row.qty && row.rate) {
        frappe.model.set_value(cdt, cdn, "amount", flt(row.qty) * flt(row.rate));
    }
    setTimeout(() => calculate_totals(frm), 100);
}
function calculate_totals(frm) {
    let total = 0, qty = 0;
    frm.doc.items.forEach(item => {
        total += flt(item.amount);
        qty += flt(item.qty);
    });
    let net_total = total;
    frm.set_value("total", total);
    frm.set_value("net_total", net_total);
    frm.set_value("total_qty", qty);
    let cumulative_tax = 0;
    frm.doc.taxes.forEach((tax, idx) => {
        let amt = 0;
        switch (tax.charge_type) {
            case "On Net Total":
                amt = net_total * flt(tax.rate) / 100;
                break;
            case "On Previous Row Total":
                amt = idx > 0 ? frm.doc.taxes[idx - 1].total * flt(tax.rate) / 100 : 0;
                break;
            case "On Previous Row Amount":
                amt = idx > 0 ? frm.doc.taxes[idx - 1].tax_amount * flt(tax.rate) / 100 : 0;
                break;
            case "On Item Quantity":
                amt = qty * flt(tax.rate);
                break;
            default:
                amt = flt(tax.tax_amount || 0);
        }
        tax.tax_amount = amt;
        cumulative_tax += amt;
        tax.total = net_total + cumulative_tax;
    });

    const grand = net_total + cumulative_tax;
    const rounded = Math.round(grand);
    const adjustment = rounded - grand;

    frm.set_value("total_taxes_and_charges", cumulative_tax);
    frm.set_value("grand_total", grand);
    frm.set_value("rounded_total", rounded);
    frm.set_value("rounding_adjustment", adjustment);

    frm.refresh_fields([
        "total", "net_total", "total_qty", "total_taxes_and_charges",
        "grand_total", "rounded_total", "rounding_adjustment", "taxes"
    ]);
}

function fetch_conversion_rate(frm) {
    if (!(frm.doc.currency && frm.doc.company && frm.doc.transaction_date)) return;
    const base = frappe.defaults.get_default("currency");
    if (frm.doc.currency === base) {
        frm.set_value("conversion_rate", 1.0);
        return;
    }
    frappe.call({
        method: 'erpnext.setup.utils.get_exchange_rate',
        args: {
            from_currency: frm.doc.currency,
            to_currency: base,
            transaction_date: frm.doc.transaction_date
        },
        callback: r => {
            if (r.message) frm.set_value('conversion_rate', r.message);
            else frappe.msgprint("Could not fetch exchange rate.");
        }
    });
}

function fetch_price_list_rate(frm) {
    if (!frm.doc.selling_price_list) return;
    frappe.db.get_value('Price List', frm.doc.selling_price_list, 'currency')
        .then(r => {
            const plc = r.message?.currency;
            frm.set_value('price_list_currency', plc);

            const base = frappe.defaults.get_default("currency");
            if (plc && plc !== base) {
                frappe.call({
                    method: 'erpnext.setup.utils.get_exchange_rate',
                    args: {
                        from_currency: plc,
                        to_currency: base,
                        transaction_date: frm.doc.transaction_date
                    },
                    callback: res => res.message && frm.set_value('plc_conversion_rate', res.message)
                });
            } else {
                frm.set_value('plc_conversion_rate', 1.0);
            }
        });
}
frappe.ui.form.on("Proforma Invoice", {
    validate: function(frm) {
        let amount = 0;

        if (frm.doc.disable_rounded_total) {
            amount = frm.doc.grand_total;
        } else {
            amount = frm.doc.rounded_total || frm.doc.grand_total;
        }

        if (amount) {
            frm.set_value("in_words", amountToWords(amount, frm.doc.currency));
        }
    }
});

function amountToWords(amount, currency) {
    const a = [
        '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
        'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
        'Seventeen', 'Eighteen', 'Nineteen'
    ];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    // Map currencies to fractional unit
    const fractionMap = {
        "AED": "Fils",
        "INR": "Paise",
        "USD": "Cents",
        "EUR": "Cents",
        "GBP": "Pence"
    };

    function inWordsIndian(num) {
        if ((num = num.toString()).length > 9) return 'Overflow';
        let n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
        if (!n) return;
        let str = '';
        str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + ' Crore ' : '';
        str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + ' Lakh ' : '';
        str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + ' Thousand ' : '';
        str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + ' Hundred ' : '';
        str += (n[5] != 0) ? ((str != '') ? 'And ' : '') +
            (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) + ' ' : '';
        return str.trim();
    }

    function inWordsInternational(num) {
        if ((num = parseInt(num, 10)) === 0) return 'Zero';
        if (num.toString().length > 12) return 'Overflow';
        
        const units = ['', 'Thousand', 'Million', 'Billion'];
        let str = '';
        let i = 0;
        
        while (num > 0) {
            let part = num % 1000;
            if (part != 0) {
                let partStr = '';
                if (part > 99) {
                    partStr += a[Math.floor(part / 100)] + ' Hundred ';
                    part = part % 100;
                }
                if (part > 0) {
                    if (part < 20) partStr += a[part] + ' ';
                    else partStr += b[Math.floor(part / 10)] + ' ' + a[part % 10] + ' ';
                }
                str = partStr + units[i] + ' ' + str;
            }
            num = Math.floor(num / 1000);
            i++;
        }
        return str.trim();
    }

    amount = parseFloat(amount).toFixed(2).split(".");
    let words = currency + " " + 
                (currency === "INR" ? inWordsIndian(amount[0]) : inWordsInternational(amount[0]));

    let fractionUnit = fractionMap[currency] || "Cents"; // fallback

    if (amount[1] && parseInt(amount[1]) > 0) {
        words += " And " + 
                 (currency === "INR" ? inWordsIndian(amount[1]) : inWordsInternational(amount[1])) + 
                 " " + fractionUnit;
    }
    return words + " Only";
}



frappe.ui.form.on('Proforma Invoice', {
    refresh(frm) {
        if (frm.doc.docstatus === 0) {
            frm.page.add_inner_button(__('Quotation'), () => open_quotation_picker(frm), __('Get Items From'));
        }
    }
});

async function open_quotation_picker(frm) {
    if (!frm.doc.customer) {
        frappe.msgprint(__('Please select a Customer.'));
        return;
    }

    // Create dialog
    const d = new frappe.ui.Dialog({
        title: __('Select Quotations'),
        size: 'large',
        fields: [{ fieldtype: 'HTML', fieldname: 'picker_html' }],
        primary_action_label: __('Get Items'),
        primary_action: async () => {
            const selected = get_selected_names($wrapper);
            if (!selected.length) {
                frappe.msgprint(__('Select at least one Quotation.'));
                return;
            }

            // Clear old items
            frm.clear_table('items');

            // Loop selected quotations and pull items
            for (const name of selected) {
                const qdoc = await frappe.db.get_doc('Quotation', name);

                // Match customer (safety check)
                if (qdoc.party_name && qdoc.party_name !== frm.doc.customer) continue;

                (qdoc.items || []).forEach(it => {
                    const row = frm.add_child('items');
                    row.item_code        = it.item_code;
                    row.item_name        = it.item_name;
                    row.description      = it.description;
                    row.qty              = it.qty;
                    row.rate             = it.rate;
                    row.amount           = it.amount;
                    row.uom              = it.uom;
                    row.conversion_factor = it.conversion_factor;
                    row.prevdoc_docname  = name; // link back to quotation
                    row.quotation_item   = it.name; // store quotation item ref
                });
            }

            frm.refresh_field('items');
            d.hide();
        }
    });

    // Render UI skeleton
    const $wrapper = $(d.fields_dict.picker_html.wrapper);
    $wrapper.html(render_picker_skeleton());
    d.show();

    // Fetch quotations (only submitted, latest first)
const res = await frappe.call({
    method: 'frappe.client.get_list',
    args: {
        doctype: 'Quotation',
        fields: ['name', 'transaction_date', 'status', 'party_name'], //use party_name
        filters: {
            docstatus: 1,
            party_name: frm.doc.customer,
            status: 'Open'// filter using party_name
        },
        order_by: 'modified desc',
        limit: 100
    }
});

    const rows = (res && res.message) || [];
    fill_rows($wrapper, rows);

    // Select all
    $wrapper.on('change', 'input[name="select_all"]', function () {
        const checked = $(this).is(':checked');
        $wrapper.find('input.qchk:visible').prop('checked', checked);
    });

    // --- Helpers ---
    function get_selected_names($wrap) {
        return $wrap.find('input.qchk:checked').map(function () {
            return $(this).data('name');
        }).get();
    }

    function render_picker_skeleton() {
        return `
            <div class="quotation-picker">
                <table class="table table-bordered table-hover">
                    <thead>
                        <tr>
                            <th style="width: 1%"><input type="checkbox" name="select_all"></th>
                            <th>${__('Name')}</th>
                            <th>${__('Date')}</th>
                            <th>${__('Status')}</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        `;
    }

    function fill_rows($wrap, rows) {
        const $tbody = $wrap.find('tbody');
        $tbody.empty();
        if (!rows.length) {
            $tbody.append(`<tr><td colspan="4" class="text-center text-muted">${__('No Quotations found')}</td></tr>`);
            return;
        }
        rows.forEach(r => {
            $tbody.append(`
                <tr data-name="${r.name}">
                    <td><input type="checkbox" class="qchk" data-name="${r.name}"></td>
                    <td>${r.name}</td>
                    <td>${frappe.datetime.str_to_user(r.transaction_date)}</td>
                    <td>${r.status}</td>
                </tr>
            `);
        });
    }
}

