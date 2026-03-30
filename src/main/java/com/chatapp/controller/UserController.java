package com.chatapp.controller;

import com.chatapp.model.User;
import com.chatapp.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public UserController(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @GetMapping
    public List<User> getAllUsers() {
        return userRepository.findAll();
    }

    @PutMapping("/profile")
    public User updateProfile(@RequestBody User profileUpdate) {
        java.util.Optional<User> userOpt = userRepository.findByUsername(profileUpdate.getUsername());
        if (userOpt.isPresent()) {
            User user = userOpt.get();
            if (profileUpdate.getDisplayName() != null)
                user.setDisplayName(profileUpdate.getDisplayName());
            if (profileUpdate.getAvatar() != null)
                user.setAvatar(profileUpdate.getAvatar());
            if (profileUpdate.getEmail() != null)
                user.setEmail(profileUpdate.getEmail());
            if (profileUpdate.getPhone() != null)
                user.setPhone(profileUpdate.getPhone());
            if (profileUpdate.getStatus() != null)
                user.setStatus(profileUpdate.getStatus());
            if (profileUpdate.getPassword() != null && !profileUpdate.getPassword().isEmpty()
                    && !profileUpdate.getPassword().equals("********")) {
                user.setPassword(passwordEncoder.encode(profileUpdate.getPassword()));
            }
            user.setUpdatedAt(new java.util.Date());
            return userRepository.save(user);
        }
        throw new RuntimeException("User not found");
    }
}
