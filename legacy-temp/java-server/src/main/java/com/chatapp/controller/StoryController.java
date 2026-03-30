package com.chatapp.controller;

import com.chatapp.model.Story;
import com.chatapp.repository.StoryRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import com.chatapp.repository.UserRepository;
import com.chatapp.model.User;
import org.springframework.data.domain.Sort;

import java.util.Date;
import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/stories")
public class StoryController {

    private final StoryRepository storyRepository;
    private final UserRepository userRepository;

    public StoryController(StoryRepository storyRepository, UserRepository userRepository) {
        this.storyRepository = storyRepository;
        this.userRepository = userRepository;
    }

    @PostMapping
    public ResponseEntity<Story> createStory(@RequestBody Story story) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated())
            return ResponseEntity.status(401).build();

        Optional<User> userOpt = userRepository.findByUsername(auth.getName());
        if (userOpt.isPresent()) {
            story.setUserId(userOpt.get().getId());
            story.setCreatedAt(new Date());
            return ResponseEntity.ok(storyRepository.save(story));
        }
        return ResponseEntity.status(401).build();
    }

    @GetMapping("/user/{userId}")
    public List<Story> getUserStories(@PathVariable String userId) {
        return storyRepository.findByUserIdOrderByCreatedAtDesc(userId);
    }

    @GetMapping("/feed")
    public List<Story> getStoryFeed() {
        // Return recent stories from everyone
        return storyRepository.findAll(Sort.by(Sort.Direction.DESC, "createdAt"));
    }
}
