package com.chatapp.repository;

import com.chatapp.model.Story;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;

public interface StoryRepository extends MongoRepository<Story, String> {
    List<Story> findByUserIdOrderByCreatedAtDesc(String userId);
}
