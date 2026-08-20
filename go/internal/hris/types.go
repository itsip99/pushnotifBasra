package hris

// NotificationPayload setara NotificationPayload di src/models/notificationJob.model.ts
type NotificationPayload struct {
	Token        string                 `json:"token"`
	Notification map[string]string      `json:"notification,omitempty"`
	Data         map[string]string      `json:"data,omitempty"`
	Android      map[string]interface{} `json:"android,omitempty"`
	APNS         map[string]interface{} `json:"apns,omitempty"`
}

// NotificationJob setara NotificationJob di src/models/notificationJob.model.ts
type NotificationJob struct {
	JobID     string                 `json:"jobId"`
	CreatedAt int64                  `json:"createdAt"`
	TtlMs     int64                  `json:"ttlMs"`
	MetaData  map[string]interface{} `json:"metaData,omitempty"`
	Message   NotificationPayload    `json:"message"`
}

func metaString(meta map[string]interface{}, key string) string {
	if meta == nil {
		return ""
	}
	if v, ok := meta[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}
