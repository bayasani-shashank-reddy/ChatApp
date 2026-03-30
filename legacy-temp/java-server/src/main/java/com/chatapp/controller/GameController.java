package com.chatapp.controller;

import com.chatapp.model.Game;
import com.chatapp.repository.GameRepository;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/games")
public class GameController {

    private final GameRepository gameRepository;
    private final SimpMessagingTemplate messagingTemplate;

    public GameController(GameRepository gameRepository, SimpMessagingTemplate messagingTemplate) {
        this.gameRepository = gameRepository;
        this.messagingTemplate = messagingTemplate;
    }

    @GetMapping("/{roomId}")
    public org.springframework.http.ResponseEntity<java.util.Map<String, String>> getGame(@PathVariable String roomId) {
        try {
            java.util.Optional<Game> found = gameRepository.findByRoomId(roomId);
            if (found.isPresent()) {
                Game g = found.get();
                java.util.Map<String, String> result = new java.util.HashMap<>();
                result.put("roomId", g.getRoomId());
                result.put("gameType", g.getGameType() != null ? g.getGameType() : "tictactoe");
                return org.springframework.http.ResponseEntity.ok(result);
            }
            return org.springframework.http.ResponseEntity.notFound().build();
        } catch (Exception e) {
            System.err.println("Error fetching game room " + roomId + ": " + e.getMessage());
            return org.springframework.http.ResponseEntity.status(404).build();
        }
    }

    @PostMapping("/create")
    public org.springframework.http.ResponseEntity<Game> createGame(@RequestBody Game gameInfo) {
        // Find or create - if roomId already exists, return it
        java.util.Optional<Game> existing = gameRepository.findByRoomId(gameInfo.getRoomId());
        if (existing.isPresent()) {
            return org.springframework.http.ResponseEntity.ok(existing.get());
        }
        gameInfo.setCreatedAt(new java.util.Date());
        Game saved = gameRepository.save(gameInfo);
        return org.springframework.http.ResponseEntity.ok(saved);
    }

    @MessageMapping("/game.move")
    public void makeMove(@Payload java.util.Map<String, Object> gameUpdate) {
        String roomId = (String) gameUpdate.get("roomId");
        messagingTemplate.convertAndSend("/topic/game/" + roomId, gameUpdate);
    }

    @MessageMapping("/game.join")
    public void joinGame(@Payload java.util.Map<String, Object> payload) {
        String roomId = (String) payload.get("roomId");
        String player = (String) payload.get("player");

        gameRepository.findByRoomId(roomId).ifPresent(game -> {
            if (player != null && !game.getPlayers().contains(player)) {
                game.getPlayers().add(player);
                gameRepository.save(game);
            }
            // Enrich payload with current room state for the joiner
            payload.put("players", game.getPlayers());
            payload.put("gameType", game.getGameType());
            payload.put("host", game.getPlayers().isEmpty() ? null : game.getPlayers().get(0));
        });

        messagingTemplate.convertAndSend("/topic/game/" + roomId, payload);
    }
}
