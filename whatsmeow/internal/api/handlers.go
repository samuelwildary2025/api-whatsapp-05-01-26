package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"

	"whatsmeow-service/internal/whatsapp"
)

// Handlers contains HTTP handlers
type Handlers struct {
	manager  *whatsapp.Manager
	upgrader websocket.Upgrader
}

// NewHandlers creates new handlers
func NewHandlers(manager *whatsapp.Manager) *Handlers {
	return &Handlers{
		manager: manager,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true // Allow all origins
			},
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
		},
	}
}

// Response helpers
func jsonResponse(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func errorResponse(w http.ResponseWriter, status int, message string) {
	jsonResponse(w, status, map[string]interface{}{
		"success": false,
		"error":   message,
	})
}

func successResponse(w http.ResponseWriter, data interface{}) {
	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    data,
	})
}

// ============================================
// Instance Handlers
// ============================================

// ConnectInstance connects an instance to WhatsApp
func (h *Handlers) ConnectInstance(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	instanceID := vars["id"]

	log.Info().Str("instanceId", instanceID).Msg("Connecting instance")

	instance, err := h.manager.Connect(instanceID)
	if err != nil {
		log.Error().Err(err).Str("instanceId", instanceID).Msg("Failed to connect")
		errorResponse(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Wait a bit for QR code or connection
	time.Sleep(2 * time.Second)

	instance.RLock()
	status := instance.Status
	qrBase64 := instance.QRCodeBase64
	waNumber := instance.WANumber
	instance.RUnlock()

	successResponse(w, map[string]interface{}{
		"status":   status,
		"qrCode":   qrBase64,
		"waNumber": waNumber,
		"message": func() string {
			if status == "connected" {
				return "Already connected"
			}
			return "Scan the QR code with WhatsApp"
		}(),
	})
}

// DisconnectInstance disconnects an instance
func (h *Handlers) DisconnectInstance(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	instanceID := vars["id"]

	log.Info().Str("instanceId", instanceID).Msg("Disconnecting instance")

	err := h.manager.Disconnect(instanceID)
	if err != nil {
		errorResponse(w, http.StatusInternalServerError, err.Error())
		return
	}

	successResponse(w, map[string]string{
		"message": "Instance disconnected successfully",
	})
}

// LogoutInstance logs out an instance
func (h *Handlers) LogoutInstance(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	instanceID := vars["id"]

	log.Info().Str("instanceId", instanceID).Msg("Logging out instance")

	err := h.manager.Logout(instanceID)
	if err != nil {
		errorResponse(w, http.StatusInternalServerError, err.Error())
		return
	}

	successResponse(w, map[string]string{
		"message": "Logged out successfully",
	})
}

// GetInstanceStatus gets instance status
func (h *Handlers) GetInstanceStatus(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	instanceID := vars["id"]

	status, info := h.manager.GetStatus(instanceID)
	_, qrBase64 := h.manager.GetQRCode(instanceID)

	successResponse(w, map[string]interface{}{
		"id":       instanceID,
		"status":   status,
		"waNumber": info["waNumber"],
		"waName":   info["waName"],
		"qrCode":   qrBase64,
	})
}

// GetQRCode gets QR code for instance
func (h *Handlers) GetQRCode(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	instanceID := vars["id"]

	_, qrBase64 := h.manager.GetQRCode(instanceID)
	status, _ := h.manager.GetStatus(instanceID)

	if qrBase64 == "" {
		if status == "connected" {
			successResponse(w, map[string]interface{}{
				"status":  "connected",
				"message": "Already connected, no QR code needed",
			})
			return
		}
		errorResponse(w, http.StatusBadRequest, "QR code not available. Try connecting first.")
		return
	}

	successResponse(w, map[string]string{
		"qrCode": qrBase64,
	})
}

// ============================================
// Message Handlers
// ============================================

// SendTextRequest represents text message request
type SendTextRequest struct {
	InstanceID string `json:"instanceId"`
	To         string `json:"to"`
	Text       string `json:"text"`
}

// SendTextMessage sends a text message
func (h *Handlers) SendTextMessage(w http.ResponseWriter, r *http.Request) {
	var req SendTextRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Validate
	if req.InstanceID == "" || req.To == "" || req.Text == "" {
		errorResponse(w, http.StatusBadRequest, "instanceId, to, and text are required")
		return
	}

	// Clean phone number
	to := cleanPhoneNumber(req.To)

	log.Info().
		Str("instanceId", req.InstanceID).
		Str("to", to).
		Msg("Sending text message")

	msgID, err := h.manager.SendTextMessage(req.InstanceID, to, req.Text)
	if err != nil {
		log.Error().Err(err).Msg("Failed to send message")
		errorResponse(w, http.StatusInternalServerError, err.Error())
		return
	}

	successResponse(w, map[string]interface{}{
		"messageId": msgID,
		"to":        to,
		"status":    "sent",
	})
}

// SendMediaRequest represents media message request
type SendMediaRequest struct {
	InstanceID string `json:"instanceId"`
	To         string `json:"to"`
	MediaURL   string `json:"mediaUrl"`
	Caption    string `json:"caption,omitempty"`
	MediaType  string `json:"mediaType,omitempty"` // image, video, audio, document
}

// SendMediaMessage sends media message
func (h *Handlers) SendMediaMessage(w http.ResponseWriter, r *http.Request) {
	var req SendMediaRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.InstanceID == "" || req.To == "" || req.MediaURL == "" {
		errorResponse(w, http.StatusBadRequest, "instanceId, to, and mediaUrl are required")
		return
	}

	// Clean phone number
	to := cleanPhoneNumber(req.To)
	mediaType := req.MediaType

	log.Info().
		Str("instanceId", req.InstanceID).
		Str("to", to).
		Str("mediaType", mediaType).
		Msg("Sending media message")

	msgID, err := h.manager.SendMediaMessage(req.InstanceID, to, req.MediaURL, req.Caption, mediaType)
	if err != nil {
		log.Error().Err(err).Msg("Failed to send media message")
		errorResponse(w, http.StatusInternalServerError, err.Error())
		return
	}

	successResponse(w, map[string]interface{}{
		"messageId": msgID,
		"to":        to,
		"status":    "sent",
	})
}

// SendPresenceRequest represents presence request
type SendPresenceRequest struct {
	InstanceID string `json:"instanceId"`
	To         string `json:"to"`
	Presence   string `json:"presence"` // composing, recording, paused
}

// SendPresence sends chat presence
func (h *Handlers) SendPresence(w http.ResponseWriter, r *http.Request) {
	var req SendPresenceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.InstanceID == "" || req.To == "" || req.Presence == "" {
		errorResponse(w, http.StatusBadRequest, "instanceId, to, and presence are required")
		return
	}

	// Clean phone number
	to := cleanPhoneNumber(req.To)

	log.Info().
		Str("instanceId", req.InstanceID).
		Str("to", to).
		Str("presence", req.Presence).
		Msg("Sending presence")

	err := h.manager.SendPresence(req.InstanceID, to, req.Presence)
	if err != nil {
		log.Error().Err(err).Msg("Failed to send presence")
		errorResponse(w, http.StatusInternalServerError, err.Error())
		return
	}

	successResponse(w, map[string]string{
		"status": "success",
	})
}

// SendLocationRequest represents location message request
type SendLocationRequest struct {
	InstanceID  string  `json:"instanceId"`
	To          string  `json:"to"`
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
	Description string  `json:"description,omitempty"`
}

// SendLocationMessage sends location message
func (h *Handlers) SendLocationMessage(w http.ResponseWriter, r *http.Request) {
	var req SendLocationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// TODO: Implement location sending
	errorResponse(w, http.StatusNotImplemented, "Location sending not yet implemented")
}

// ============================================
// Contact & Group Handlers
// ============================================

// GetContacts gets contacts for instance
func (h *Handlers) GetContacts(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement
	errorResponse(w, http.StatusNotImplemented, "Not yet implemented")
}

// CheckNumber checks if number is on WhatsApp
func (h *Handlers) CheckNumber(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement
	errorResponse(w, http.StatusNotImplemented, "Not yet implemented")
}

// GetGroups gets groups for instance
func (h *Handlers) GetGroups(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement
	errorResponse(w, http.StatusNotImplemented, "Not yet implemented")
}

// ============================================
// WebSocket Handler
// ============================================

// WebSocketHandler handles WebSocket connections for real-time events
func (h *Handlers) WebSocketHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	instanceID := vars["instanceId"]

	// Upgrade to WebSocket
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Error().Err(err).Msg("Failed to upgrade WebSocket")
		return
	}
	defer conn.Close()

	log.Info().Str("instanceId", instanceID).Msg("WebSocket connected")

	// Subscribe to events
	eventChan := h.manager.Subscribe(instanceID)
	defer h.manager.Unsubscribe(instanceID, eventChan)

	// Send initial status
	status, info := h.manager.GetStatus(instanceID)
	_, qrBase64 := h.manager.GetQRCode(instanceID)

	initialEvent := map[string]interface{}{
		"type":       "status",
		"instanceId": instanceID,
		"data": map[string]interface{}{
			"status":   status,
			"waNumber": info["waNumber"],
			"waName":   info["waName"],
			"qrCode":   qrBase64,
		},
	}
	conn.WriteJSON(initialEvent)

	// Handle ping/pong
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	// Start ping ticker
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	// Read goroutine (to detect disconnection)
	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			_, _, err := conn.ReadMessage()
			if err != nil {
				return
			}
		}
	}()

	// Event loop
	for {
		select {
		case event := <-eventChan:
			if err := conn.WriteJSON(event); err != nil {
				log.Error().Err(err).Msg("Failed to write to WebSocket")
				return
			}

		case <-ticker.C:
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}

		case <-done:
			log.Info().Str("instanceId", instanceID).Msg("WebSocket disconnected")
			return
		}
	}
}

// ============================================
// Helpers
// ============================================

func cleanPhoneNumber(number string) string {
	result := ""
	for _, c := range number {
		if c >= '0' && c <= '9' {
			result += string(c)
		}
	}
	return result
}
