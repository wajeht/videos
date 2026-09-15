import type { Knex } from "knex";

export interface ProgressRepository {
  markOpened(videoId: string): Promise<void>;
  savePosition(videoId: string, positionSeconds: number): Promise<void>;
  completeVideo(videoId: string, positionSeconds: number): Promise<void>;
  resetVideo(videoId: string): Promise<void>;
  resetPlaylist(playlistId: string): Promise<void>;
}

export function createProgressRepository(database: Knex, profileId: string): ProgressRepository {
  return {
    async markOpened(videoId) {
      await database("progress")
        .where({ profile_id: profileId, video_id: videoId, completed: false })
        .where("position_seconds", ">", 0)
        .update({ updated_at: new Date().toISOString() });
    },

    async savePosition(videoId, positionSeconds) {
      const now = new Date().toISOString();
      await database("progress")
        .insert({
          profile_id: profileId,
          video_id: videoId,
          position_seconds: positionSeconds,
          completed: false,
          updated_at: now,
        })
        .onConflict(["profile_id", "video_id"])
        .merge({
          position_seconds: database.raw(
            "CASE WHEN progress.completed = 1 THEN progress.position_seconds ELSE excluded.position_seconds END",
          ),
          updated_at: now,
        });
    },

    async completeVideo(videoId, positionSeconds) {
      const now = new Date().toISOString();
      await database("progress")
        .insert({
          profile_id: profileId,
          video_id: videoId,
          position_seconds: positionSeconds,
          completed: true,
          updated_at: now,
        })
        .onConflict(["profile_id", "video_id"])
        .merge({ position_seconds: positionSeconds, completed: true, updated_at: now });
    },

    async resetVideo(videoId) {
      await database("progress").where({ profile_id: profileId, video_id: videoId }).delete();
    },

    async resetPlaylist(playlistId) {
      await database("progress")
        .where({ profile_id: profileId })
        .whereIn("video_id", database("videos").select("id").where({ playlist_id: playlistId }))
        .delete();
    },
  };
}
