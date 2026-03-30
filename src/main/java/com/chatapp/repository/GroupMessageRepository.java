package com.chatapp.repository;

import com.chatapp.model.GroupMessage;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;

public interface GroupMessageRepository extends MongoRepository<GroupMessage, String> {
    List<GroupMessage> findByGroupOrderByTimestampAsc(String groupId);
}
