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
        if (callMessage.getTargetId() != null && !callMessage.getTargetId().isEmpty()) {
            System.out.println("Routing call signal from " + callMessage.getSenderId() + " to "
                    + callMessage.getTargetId() + ", type: " + callMessage.getType());
            messagingTemplate.convertAndSendToUser(
                    callMessage.getTargetId(), "/queue/call", callMessage);
        } else {
            System.err.println("Received call signal without targetId from: " + callMessage.getSenderId());
        }
    }

    @PostMapping("/log")
    public ResponseEntity<Call> logCall(@RequestBody Call call) {
        if (call.getStartTime() == null) {
            call.setStartTime(new Date());
        }
        if (call.getEndTime() != null && call.getDuration() == 0) {
            long diffInMillies = Math.abs(call.getEndTime().getTime() - call.getStartTime().getTime());
            long diffInSeconds = diffInMillies / 1000;
            call.setDuration((int) diffInSeconds);
        }
        return ResponseEntity.ok(callRepository.save(call));
    }

    @GetMapping("/user/{userId}")
    public List<Call> getUserCalls(@PathVariable String userId) {
        return callRepository.findByCallerOrReceiverOrderByStartTimeDesc(userId, userId);
    }
}
