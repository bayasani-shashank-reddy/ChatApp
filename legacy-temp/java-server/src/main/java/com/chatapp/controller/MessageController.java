package com.chatapp.controller;

import com.chatapp.model.Message;
import com.chatapp.repository.MessageRepository;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.Date;
import java.util.List;

@RestController
@RequestMapping("/api/messages")
public class MessageController {

    private final MessageRepository messageRepository;
    private final SimpMessagingTemplate messagingTemplate;

    public MessageController(MessageRepository messageRepository, SimpMessagingTemplate messagingTemplate) {
        this.messageRepository = messageRepository;
        this.messagingTemplate = messagingTemplate;
    }

    @GetMapping("/{senderId}/{receiverId}")
    public List<Message> getMessageHistory(@PathVariable String senderId, @PathVariable String receiverId) {
        // Returns full conversation between the two users (both directions)
        List<Message> sentByMe = messageRepository.findBySenderAndReceiver(senderId, receiverId);
        List<Message> sentByThem = messageRepository.findBySenderAndReceiver(receiverId, senderId);
        java.util.List<Message> all = new java.util.ArrayList<>();
        all.addAll(sentByMe);
        all.addAll(sentByThem);
        all.sort(java.util.Comparator
                .comparing(msg -> msg.getTimestamp() != null ? msg.getTimestamp() : new java.util.Date(0)));
        return all;
    }

    @MessageMapping("/chat.sendMessage")
    public void sendMessage(@Payload Message chatMessage) {
        chatMessage.setTimestamp(new Date());
        Message savedMessage = messageRepository.save(chatMessage);

        // Push message to the receiver's private queue
        messagingTemplate.convertAndSendToUser(
                savedMessage.getReceiver(), "/queue/messages", savedMessage);
    }
}
