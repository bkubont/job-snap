export type PickedContact = {
  name: string;
  phone: string;
  email: string;
};

type ContactPickerContact = {
  name?: string[];
  tel?: string[];
  email?: string[];
};

type ContactsManager = {
  select: (
    properties: string[],
    options?: { multiple?: boolean },
  ) => Promise<ContactPickerContact[]>;
};

declare global {
  interface Navigator {
    contacts?: ContactsManager;
  }
}

export function canUseContactPicker() {
  return typeof navigator !== "undefined" && !!navigator.contacts?.select;
}

export async function pickPhoneContacts(): Promise<PickedContact[]> {
  if (!navigator.contacts?.select) {
    throw new Error("Contact picker is not available on this device/browser.");
  }
  const selected = await navigator.contacts.select(["name", "tel", "email"], {
    multiple: true,
  });
  return selected
    .map((c) => ({
      name: (c.name?.[0] ?? "").trim(),
      phone: (c.tel?.[0] ?? "").trim(),
      email: (c.email?.[0] ?? "").trim(),
    }))
    .filter((c) => c.name.length > 0);
}
