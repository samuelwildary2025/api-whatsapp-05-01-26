package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	waProto "go.mau.fi/whatsmeow/proto/waCompanionReg"
	"go.mau.fi/whatsmeow/store"
	"google.golang.org/protobuf/proto"

	"whatsmeow-service/internal/api"
	"whatsmeow-service/internal/whatsapp"
)

func main() {
	// Setup logger
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})

	// Get port from env or default
	port := os.Getenv("WHATSMEOW_PORT")
	if port == "" {
		port = "8081"
	}

	// Get data directory from env or default
	dataDir := os.Getenv("WHATSMEOW_DATA_DIR")
	if dataDir == "" {
		dataDir = "./data"
	}

	// Create data directory if not exists
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		log.Fatal().Err(err).Msg("Failed to create data directory")
	}

	// Configure device identity as Chrome browser on macOS
	// This makes WhatsApp show "Chrome" instead of "Outros" in connected devices
	store.DeviceProps.Os = proto.String("Mac OS")
	store.DeviceProps.PlatformType = waProto.DeviceProps_CHROME.Enum()
	store.DeviceProps.RequireFullSync = proto.Bool(false)

	log.Info().Msg("Configured device identity as Chrome on Mac OS")

	// Initialize WhatsApp manager
	manager, err := whatsapp.NewManager(dataDir)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to initialize WhatsApp manager")
	}

	// Initialize API handlers
	handlers := api.NewHandlers(manager)

	// Setup router
	router := mux.NewRouter()

	// Health check
	router.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"healthy","service":"whatsmeow"}`))
	}).Methods("GET")

	// Instance routes
	router.HandleFunc("/instance/{id}/connect", handlers.ConnectInstance).Methods("POST")
	router.HandleFunc("/instance/{id}/connect-code", handlers.ConnectWithCode).Methods("POST")
	router.HandleFunc("/instance/{id}/disconnect", handlers.DisconnectInstance).Methods("POST")
	router.HandleFunc("/instance/{id}/logout", handlers.LogoutInstance).Methods("POST")
	router.HandleFunc("/instance/{id}/status", handlers.GetInstanceStatus).Methods("GET")
	router.HandleFunc("/instance/{id}/settings", handlers.SetSettings).Methods("POST")
	router.HandleFunc("/instance/{id}/proxy", handlers.SetProxy).Methods("POST")
	router.HandleFunc("/instance/{id}/qr", handlers.GetQRCode).Methods("GET")

	// Message routes
	router.HandleFunc("/message/text", handlers.SendTextMessage).Methods("POST")
	router.HandleFunc("/message/media", handlers.SendMediaMessage).Methods("POST")
	router.HandleFunc("/message/presence", handlers.SendPresence).Methods("POST")
	router.HandleFunc("/message/location", handlers.SendLocationMessage).Methods("POST")
	router.HandleFunc("/message/poll", handlers.SendPollMessage).Methods("POST")
	router.HandleFunc("/message/edit", handlers.EditMessage).Methods("POST")
	router.HandleFunc("/message/react", handlers.ReactToMessage).Methods("POST")
	router.HandleFunc("/message/read", handlers.MarkChatAsRead).Methods("POST")
	router.HandleFunc("/message/delete", handlers.DeleteMessage).Methods("POST")

	// Contact routes
	router.HandleFunc("/contacts/{instanceId}", handlers.GetContacts).Methods("GET")
	router.HandleFunc("/contacts/{instanceId}/check", handlers.CheckNumber).Methods("POST")

	// Chat routes
	router.HandleFunc("/chats/{instanceId}", handlers.GetChats).Methods("GET")
	router.HandleFunc("/chats/{instanceId}/messages", handlers.GetChatMessages).Methods("POST")

	// Group routes
	router.HandleFunc("/groups/{instanceId}", handlers.GetGroups).Methods("GET")

	// WebSocket for events
	router.HandleFunc("/ws/{instanceId}", handlers.WebSocketHandler).Methods("GET")

	// CORS middleware
	corsRouter := corsMiddleware(router)

	// Create server
	server := &http.Server{
		Addr:         ":" + port,
		Handler:      corsRouter,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in goroutine
	go func() {
		log.Info().Str("port", port).Msg("🚀 Whatsmeow service started")
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("Server failed")
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info().Msg("Shutting down server...")

	// Graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Disconnect all WhatsApp clients
	manager.DisconnectAll()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatal().Err(err).Msg("Server forced to shutdown")
	}

	log.Info().Msg("Server stopped")
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Instance-Token")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
