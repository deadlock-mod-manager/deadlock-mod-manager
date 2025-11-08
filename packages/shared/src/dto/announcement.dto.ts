import type { Announcement } from "@deadlock-mods/database";

export const toAnnouncementDto = (announcement: Announcement) => {
  return {
    id: announcement.id,
    title: announcement.title,
    content: announcement.content,
    iconUrl: announcement.iconUrl,
    linkUrl: announcement.linkUrl,
    linkLabel: announcement.linkLabel,
    category: announcement.category as "maintenance" | "downtime" | "info",
    status: announcement.status as "draft" | "published" | "archived",
    authorId: announcement.authorId,
    publishedAt: announcement.publishedAt,
    createdAt: announcement.createdAt,
    updatedAt: announcement.updatedAt,
  };
};

export type AnnouncementDto = ReturnType<typeof toAnnouncementDto>;
