import type { Knex } from "knex";

interface SettingRow {
  profile_id: string;
  key: string;
  value: string;
  updated_at: string;
}

export interface SettingsRepository {
  getValue(key: string): Promise<string>;
  setValue(key: string, value: string): Promise<void>;
}

export function createSettingsRepository(database: Knex, profileId: string): SettingsRepository {
  return {
    async getValue(key) {
      const row = await database<SettingRow>("profile_settings")
        .select("value")
        .where({ profile_id: profileId, key })
        .first();
      if (!row) throw new Error(`Missing setting: ${key}`);
      return row.value;
    },

    async setValue(key, value) {
      const updated = await database("profile_settings")
        .where({ profile_id: profileId, key })
        .update({ value, updated_at: new Date().toISOString() });
      if (updated !== 1) throw new Error(`Missing setting: ${key}`);
    },
  };
}
