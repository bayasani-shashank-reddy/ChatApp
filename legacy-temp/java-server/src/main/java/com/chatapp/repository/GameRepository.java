package com.chatapp.repository;

import com.chatapp.model.Game;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.Optional;

public interface GameRepository extends MongoRepository<Game, String> {
    Optional<Game> findByRoomId(String roomId);
}
