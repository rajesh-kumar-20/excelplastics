frappe.ui.form.on("Work Order", {
    refresh(frm) {
        frm.add_custom_button("Job Card Report", () => {
            let url = `/printview?doctype=Work Order&name=${frm.doc.name}&format=Job Card Summary&no_letterhead=0`;
            window.open(url);
        });
    }
});

frappe.ui.form.on('Work Order', {
    refresh(frm) {
        load_molds_and_apply_filter(frm);
    },

    production_item(frm) {
        load_molds_and_apply_filter(frm);
    }
});

function load_molds_and_apply_filter(frm) {
    frm._mold_list = [];

    if (!frm.doc.production_item) {
        frm.set_value("custom_mold_id", null);
        return;
    }

    frappe.db.get_doc("Item", frm.doc.production_item).then(item => {

        const rows = item.custom_mold_id || [];
        frm._mold_list = rows.map(r => r.mold_id).filter(Boolean);

        // Apply filter FIRST
        frm.set_query("custom_mold_id", () => {
            return {
                filters: {
                    name: ["in", frm._mold_list.length ? frm._mold_list : [""]]
                }
            };
        });

        // Refresh the field to apply new query
        frm.refresh_field("custom_mold_id");

        // 🔥 KEY FIX:
        // Run auto-set AFTER the field re-renders
        frappe.after_ajax(() => {
            if (frm._mold_list.length === 1) {
                frm.set_value("custom_mold_id", frm._mold_list[0]);
            }
        });
    });
}

frappe.ui.form.on('Work Order', {
    refresh(frm) {
        recalculate_all_operations(frm);
    },

    validate(frm) {
        recalculate_all_operations(frm);
    }
});

frappe.ui.form.on('Work Order Operation', {
    time_in_mins(frm, cdt, cdn) {
        set_human_readable_time(cdt, cdn);
    }
});

function recalculate_all_operations(frm) {
    (frm.doc.operations || []).forEach(row => {
        set_human_readable_time(row.doctype, row.name);
    });
}

function set_human_readable_time(cdt, cdn) {
    let row = locals[cdt][cdn];
    if (!row || !row.time_in_mins) {
        frappe.model.set_value(cdt, cdn, 'custom_estimated_time', '');
        return;
    }
    let total_mins = Math.floor(flt(row.time_in_mins));
    let days = Math.floor(total_mins / 1440);
    let remainder = total_mins % 1440;
    let hours = Math.floor(remainder / 60);
    let minutes = remainder % 60;
    let parts = [];
    if (days) parts.push(`${days} day${days > 1 ? 's' : ''}`);
    if (hours) parts.push(`${hours} hr${hours > 1 ? 's' : ''}`);
    if (minutes && days === 0) {
        parts.push(`${minutes} min${minutes > 1 ? 's' : ''}`);
    }

    frappe.model.set_value(
        cdt,
        cdn,
        'custom_estimated_time',
        parts.join(' ')
    );
}
