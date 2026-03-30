package com.chatapp.controller;

import com.chatapp.dto.CallMessage;
import com.chatapp.model.Call;
import com.chatapp.repository.CallRepository;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;

import java.util.Date;
import java.util.List;

@RestController
@RequestMapping("/api/calls")
public class CallController {

    private final SimpMessagingTemplate messagingTemplate;
    private final CallRepository callRepository;

    public CallController(SimpMessagingTemplate messagingTemplate, CallRepository callRepository) {
        this.messagingTemplate = messagingTemplate;
        this.callRepository = callRepository;
    }

    @MessageMapping("/call.signal")
    public void handleCallSignal(@Payload CallMessage callMessage) {
        // Route the WebRTC signal (offer/answer/candidate) to the specific target user
        messagingTemplate.convertAndSendToUser(
                callMessage.getTargetId(), "/queue/call", callMessage);
    }

    @PostMapping("/log")
    public ResponseEntity<Call> logCall(@RequestBody Call call) {
        if (call.getStartTime() == null) {
            call.setStartTime(new Date());
        }
        return ResponseEntity.ok(callRepository.save(call));
    }

    @GetMapping("/user/{userId}")
    public List<Call> getUserCalls(@PathVariable String userId) {
        return callRepository.findByCallerOrReceiverOrderByStartTimeDesc(userId, userId);
    }
}
