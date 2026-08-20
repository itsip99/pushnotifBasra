export type FcmData = Record<string, string>;

export interface NotificationPayload {
  token: string;

  notification: {
    title?: string;
    body?: string;
    image?: string;
  };

  data?: FcmData;

  android?: {
    priority?: "high" | "normal";
    notification?: {
      sound?: string;
      channel_id?: string;
      icon?: string;
    };
  };

  apns?: {
    headers?: Record<string, string>;
    payload?: { aps?: Record<string, any> };
    fcm_options?: Record<string, any>;
  };
}

export interface NotificationMetaData {
  userid?: string;
  msg?: string;
  jenis?: string;
  [key: string]: any;
}

export interface NotificationJob {
  jobId: string;
  createdAt: number;
  ttlMs: number;
  metaData?: NotificationMetaData;
  message: NotificationPayload;
}
