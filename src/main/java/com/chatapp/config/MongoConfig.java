package com.chatapp.config;

import com.mongodb.ConnectionString;
import com.mongodb.MongoClientSettings;
import com.mongodb.MongoCredential;
import com.mongodb.ServerAddress;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.config.AbstractMongoClientConfiguration;
import org.springframework.data.mongodb.repository.config.EnableMongoRepositories;

import java.util.List;

/**
 * MongoConfig — builds the MongoDB client programmatically.
 *
 * This handles Atlas SRV connections correctly even when the password
 * contains special characters like $ and . that break URI string parsing.
 *
 * Two modes:
 * 1. If MONGO_URI env var is set (Render deployment) → use that URI directly
 * 2. Otherwise → build from host + username + password properties (local dev /
 * Atlas)
 */
@Configuration
@EnableMongoRepositories(basePackages = "com.chatapp.repository")
public class MongoConfig extends AbstractMongoClientConfiguration {

    /** Full URI — used in production (set as env var on Render) */
    @Value("${spring.data.mongodb.uri:}")
    private String mongoUri;

    /** Atlas cluster hostname, e.g. cluster0.ab1cd.mongodb.net */
    @Value("${spring.data.mongodb.host:CLUSTER_HOST}")
    private String mongoHost;

    @Value("${spring.data.mongodb.username:chatapp}")
    private String mongoUsername;

    @Value("${spring.data.mongodb.password:}")
    private String mongoPassword;

    @Value("${spring.data.mongodb.database:chatapp}")
    private String mongoDatabase;

    @Override
    protected String getDatabaseName() {
        return mongoDatabase;
    }

    @Override
    public MongoClient mongoClient() {
        // If an explicit URI is provided (e.g. from Render's MONGO_URI env var), use it
        if (mongoUri != null && !mongoUri.isBlank() && !mongoUri.equals("")) {
            return MongoClients.create(
                    MongoClientSettings.builder()
                            .applyConnectionString(new ConnectionString(mongoUri))
                            .build());
        }

        // Otherwise build from individual Atlas credentials (handles special char
        // passwords)
        // Using mongodb+srv:// SRV format = Atlas standard
        String srvUri = "mongodb+srv://" + mongoHost + "/" + mongoDatabase
                + "?retryWrites=true&w=majority&authSource=admin";

        MongoCredential credential = MongoCredential.createCredential(
                mongoUsername,
                "admin",
                mongoPassword.toCharArray());

        return MongoClients.create(
                MongoClientSettings.builder()
                        .applyConnectionString(new ConnectionString(srvUri))
                        .credential(credential)
                        .build());
    }

    @Override
    protected boolean autoIndexCreation() {
        return true;
    }
}
