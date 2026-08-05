import frappe


# ============================================================
# Events
# ============================================================

def validate(doc, method):
    set_status_indicator(doc)
    update_mold_status(doc)


def on_update(doc, method):
    update_open_job_cards(doc)


# ============================================================
# Before Save
# ============================================================

def set_status_indicator(doc):
    if doc.status == "Off":
        doc.description = "🟢"

    elif doc.status == "Production":
        doc.description = "🔴"

    else:
        doc.description = "🟡"


def update_mold_status(doc):
    if not (
        doc.has_value_changed("status")
        and doc.custom_mold_id
    ):
        return

    status_map = {
        "Production": "Production",
        "Off": "Available",
    }

    new_status = status_map.get(doc.status)

    if not new_status:
        return

    frappe.db.set_value(
        "Mold Master",
        doc.custom_mold_id,
        "status",
        new_status,
        update_modified=False,
    )


# ============================================================
# After Save
# ============================================================

def update_open_job_cards(doc):
    if not doc.custom_mold_id:
        return

    job_cards = frappe.get_all(
        "Job Card",
        filters={
            "workstation": doc.name,
            "status": "Open",
        },
        pluck="name",
    )

    for job_card_name in job_cards:

        frappe.db.set_value(
            "Job Card",
            job_card_name,
            "custom_previous_mold",
            doc.custom_mold_id,
            update_modified=False,
        )