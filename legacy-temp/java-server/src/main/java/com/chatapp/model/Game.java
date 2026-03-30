package com.chatapp.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;
import java.util.Date;
import java.util.List;
import java.util.ArrayList;
import java.util.Map;
import java.util.HashMap;

@Document(collection = "games")
public class Game {
    @Id
    private String id;

    @Indexed(unique = true)
    private String roomId;

    private String gameType = "tictactoe"; // 'tictactoe', 'connect4', 'rps', 'chess'
    private List<String> players = new ArrayList<>(); // User IDs
    private Object board; // Flexible object
    private String turn; // User ID
    private String winner; // User ID or 'draw' or null

    // RPS specific
    private int round = 1;
    private Map<String, String> roundMoves = new HashMap<>();
    private Map<String, Integer> scores = new HashMap<>();

    private Date createdAt;
    private Date updatedAt;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getRoomId() {
        return roomId;
    }

    public void setRoomId(String roomId) {
        this.roomId = roomId;
    }

    public String getGameType() {
        return gameType;
    }

    public void setGameType(String gameType) {
        this.gameType = gameType;
    }

    public List<String> getPlayers() {
        return players;
    }

    public void setPlayers(List<String> players) {
        this.players = players;
    }

    public Object getBoard() {
        return board;
    }

    public void setBoard(Object board) {
        this.board = board;
    }

    public String getTurn() {
        return turn;
    }

    public void setTurn(String turn) {
        this.turn = turn;
    }

    public String getWinner() {
        return winner;
    }

    public void setWinner(String winner) {
        this.winner = winner;
    }

    public int getRound() {
        return round;
    }

    public void setRound(int round) {
        this.round = round;
    }

    public Map<String, String> getRoundMoves() {
        return roundMoves;
    }

    public void setRoundMoves(Map<String, String> roundMoves) {
        this.roundMoves = roundMoves;
    }

    public Map<String, Integer> getScores() {
        return scores;
    }

    public void setScores(Map<String, Integer> scores) {
        this.scores = scores;
    }

    public Date getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Date createdAt) {
        this.createdAt = createdAt;
    }

    public Date getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Date updatedAt) {
        this.updatedAt = updatedAt;
    }
}
