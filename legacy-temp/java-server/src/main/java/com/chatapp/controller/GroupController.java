package com.chatapp.controller;

import com.chatapp.model.Group;
import com.chatapp.model.GroupMessage;
import com.chatapp.repository.GroupRepository;
import com.chatapp.repository.GroupMessageRepository;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.Date;
import java.util.List;

@RestController
@RequestMapping("/api/groups")
public class GroupController {

    private final GroupRepository groupRepository;
    private final GroupMessageRepository groupMessageRepository;
    private final SimpMessagingTemplate messagingTemplate;

    public GroupController(GroupRepository groupRepository, GroupMessageRepository groupMessageRepository,
            SimpMessagingTemplate messagingTemplate) {
        this.groupRepository = groupRepository;
        this.groupMessageRepository = groupMessageRepository;
        this.messagingTemplate = messagingTemplate;
    }

    @GetMapping("/user/{userId}")
    public List<Group> getUserGroups(@PathVariable String userId) {
        try {
            System.out.println("Fetching groups for user: " + userId);
            List<Group> groups = groupRepository.findByMembersContaining(userId);
            return groups != null ? groups : new java.util.ArrayList<>();
        } catch (Exception e) {
            System.err.println("Error fetching groups for user " + userId + ": " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("Error fetching groups: " + e.getMessage());
        }
    }

    @GetMapping("/{groupId}/messages")
    public List<GroupMessage> getGroupMessages(@PathVariable String groupId) {
        return groupMessageRepository.findByGroupOrderByTimestampAsc(groupId);
    }

    @PostMapping({ "/", "" })
    public Group createGroup(@RequestBody Group group) {
        if (group.getCreatedAt() == null)
            group.setCreatedAt(new Date());
        if (group.getMembers() == null)
            group.setMembers(new java.util.ArrayList<>());
        if (group.getAdmins() == null)
            group.setAdmins(new java.util.ArrayList<>());
        return groupRepository.save(group);
    }

    @MessageMapping("/chat.sendGroupMessage")
    public void sendGroupMessage(@Payload GroupMessage message) {
        message.setTimestamp(new Date());
        GroupMessage savedMessage = groupMessageRepository.save(message);

        // Push message to the group topic
        messagingTemplate.convertAndSend("/topic/group." + message.getGroup(), savedMessage);
    }
}
