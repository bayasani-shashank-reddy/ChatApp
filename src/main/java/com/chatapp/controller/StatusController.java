package com.chatapp.controller;

import com.chatapp.dto.CallStatus;
import com.chatapp.model.User;
import com.chatapp.repository.UserRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/status")
public class StatusController {

    private final UserRepository userRepository;

    public StatusController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @GetMapping("/{callId}")
    public CallStatus getCallStatus(@PathVariable String callId) {
        CallStatus status = new CallStatus();
        status.setCallId(callId);
        status.setStatus("UNKNOWN");
        return status;
    }

    @PostMapping
    public ResponseEntity<?> updateUserStatus(@RequestBody Map<String, String> payload) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated())
            return ResponseEntity.status(401).build();

        String username = auth.getName();
        String newStatus = payload.get("status");

        Optional<User> userOpt = userRepository.findByUsername(username);
        if (userOpt.isPresent()) {
            User user = userOpt.get();
            user.setStatus(newStatus);
            userRepository.save(user);
            return ResponseEntity.ok().build();
        }
        return ResponseEntity.notFound().build();
    }
}
