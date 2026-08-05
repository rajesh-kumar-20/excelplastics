import frappe

def validate(doc, method):
    set_item_flags(doc)
    calculate_weight(doc)

def on_update(doc, method):
    update_mold_count(doc)

# ---------------------------------------------------------------------
# Before Save
# ---------------------------------------------------------------------

def set_item_flags(doc):
    doc.custom_is_material_grade = 0
    doc.custom_is_color_grade = 0
    doc.custom_is_finished_good = 0
    doc.custom_is_additive = 0
    doc.custom_is_packing_material = 0

    if doc.naming_series == "RM.##":
        doc.custom_is_material_grade = 1

    elif doc.naming_series == "MB.###":
        doc.custom_is_color_grade = 1

    elif doc.naming_series == "FG.####":
        doc.custom_is_finished_good = 1

    elif doc.naming_series == "AD.##":
        doc.custom_is_additive = 1

    elif doc.naming_series in ["PM.###", "PKG.##"]:
        doc.custom_is_packing_material = 1


def calculate_weight(doc):
    doc.weight_per_unit = 0
    doc.weight_uom = None

    for row in doc.item_quality_inspection_parameter:
        if row.specification == "Weight":
            if row.min_value is not None and row.max_value is not None:
                doc.weight_per_unit = (
                    row.min_value + row.max_value
                ) / 2
                doc.weight_uom = row.custom_uom
                break

# ---------------------------------------------------------------------
# After Save
# ---------------------------------------------------------------------

def update_mold_count(doc):
    current_molds = {
        row.mold_id
        for row in doc.custom_mold_id
        if row.mold_id
    }

    old_molds = set()

    if doc.get_doc_before_save():
        old_doc = doc.get_doc_before_save()

        old_molds = {
            row.mold_id
            for row in old_doc.custom_mold_id
            if row.mold_id
        }

    affected_molds = current_molds | old_molds

    for mold in affected_molds:
        count = frappe.db.count(
            "Mold Master Link",
            {"mold_id": mold},
        )

        frappe.db.set_value(
            "Mold Master",
            mold,
            "linked_item_count",
            count,
        )