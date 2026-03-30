package com.chatapp.repository;

import com.chatapp.model.UsageLog;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;

public interface UsageLogRepository extends MongoRepository<UsageLog, String> {
    List<UsageLog> findByUserIdOrderByLoginTimeDesc(String userId);
}
